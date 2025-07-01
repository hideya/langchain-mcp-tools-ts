/**
 * Alternative approach: Convert JSON schemas to Zod schemas to avoid the OpenAI integration bug.
 * 
 * This provides a clean workaround without monkey patching by converting JSON schemas
 * to Zod schemas before creating DynamicStructuredTool instances.
 */

import { jsonSchemaToZod } from "@h1deya/json-schema-to-zod";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { isInteropZodSchema } from "@langchain/core/utils/types";

/**
 * Creates a DynamicStructuredTool that works reliably with OpenAI models.
 * 
 * This function automatically converts JSON schemas to Zod schemas to avoid
 * the "Cannot read properties of undefined (reading 'typeName')" error
 * that occurs when using JSON schemas with OpenAI models.
 * 
 * @param config Tool configuration
 * @returns A DynamicStructuredTool that works with OpenAI models
 * 
 * @example
 * ```typescript
 * const tool = createOpenAICompatibleTool({
 *   name: "my-tool",
 *   description: "My tool description",
 *   schema: {
 *     type: "object",
 *     properties: {
 *       input: { type: "string" }
 *     },
 *     required: ["input"]
 *   },
 *   func: async (input) => {
 *     return `Processed: ${input.input}`;
 *   }
 * });
 * ```
 */
export function createOpenAICompatibleTool<T = any>(config: {
  name: string;
  description: string;
  schema: any;
  func: (input: T) => Promise<string> | string;
}): DynamicStructuredTool {
  // Check if schema is already a Zod schema
  const isZodSchema = isInteropZodSchema(config.schema);
  
  let finalSchema;
  if (isZodSchema) {
    // Already a Zod schema, use as-is
    finalSchema = config.schema;
  } else {
    // Convert JSON schema to Zod schema to avoid OpenAI integration bug
    try {
      finalSchema = jsonSchemaToZod(config.schema);
      console.debug(`🔄 Converted JSON schema to Zod for tool: ${config.name}`);
    } catch (error) {
      console.warn(`⚠️  Failed to convert schema for tool ${config.name}, using original:`, error);
      finalSchema = config.schema;
    }
  }
  
  return new DynamicStructuredTool({
    name: config.name,
    description: config.description,
    schema: finalSchema,
    func: config.func,
  });
}

/**
 * Converts existing DynamicStructuredTool instances to be OpenAI-compatible.
 * 
 * This function takes existing tools with JSON schemas and converts them
 * to use Zod schemas instead, avoiding the OpenAI integration bug.
 * 
 * @param tools Array of DynamicStructuredTool instances
 * @returns Array of OpenAI-compatible tools
 * 
 * @example
 * ```typescript
 * const originalTools = await convertMcpToLangchainTools(mcpServers);
 * const fixedTools = makeToolsOpenAICompatible(originalTools.tools);
 * 
 * const llm = new ChatOpenAI({ model: "gpt-4" });
 * const agent = createReactAgent({ llm, tools: fixedTools });
 * ```
 */
export function makeToolsOpenAICompatible(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
  return tools.map(tool => {
    // Check if the tool's schema is already a Zod schema
    const isZodSchema = isInteropZodSchema(tool.schema);
    
    if (isZodSchema) {
      // Already compatible, return as-is
      return tool;
    }
    
    try {
      // Convert JSON schema to Zod schema
      const zodSchema = jsonSchemaToZod(tool.schema);
      
      // Create a new tool with the Zod schema
      return createOpenAICompatibleTool({
        name: tool.name,
        description: tool.description,
        schema: zodSchema,
        func: tool.func,
      });
    } catch (error) {
      console.warn(`⚠️  Failed to convert tool ${tool.name} to OpenAI-compatible format:`, error);
      return tool; // Return original tool if conversion fails
    }
  });
}

/**
 * Simple utility to check if tools are OpenAI-compatible.
 * 
 * @param tools Array of tools to check
 * @returns Information about tool compatibility
 */
export function checkToolCompatibility(tools: DynamicStructuredTool[]): {
  compatible: number;
  incompatible: number;
  details: Array<{ name: string; compatible: boolean; schemaType: string }>;
} {
  const details = tools.map(tool => {
    const isZodSchema = isInteropZodSchema(tool.schema);
    return {
      name: tool.name,
      compatible: isZodSchema,
      schemaType: isZodSchema ? 'Zod' : 'JSON'
    };
  });
  
  const compatible = details.filter(d => d.compatible).length;
  const incompatible = details.filter(d => !d.compatible).length;
  
  return { compatible, incompatible, details };
}
