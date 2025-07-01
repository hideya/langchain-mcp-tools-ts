/**
 * Monkey patch for LangChain OpenAI integration bug.
 * 
 * This file provides a workaround for the issue where LangChain's OpenAI integration
 * incorrectly calls OpenAI's zodFunction() with JSON schemas, causing:
 * "TypeError: Cannot read properties of undefined (reading 'typeName')"
 * 
 * The root cause is in @langchain/openai's _convertToOpenAITool() function
 * which tries to use OpenAI's zodFunction() first, but zodFunction() assumes
 * all schemas are Zod schemas and doesn't do proper type checking.
 * 
 * This patch replaces the problematic function with a fixed version that
 * uses LangChain's own convertToOpenAIFunction() directly for JSON schemas.
 */

import { convertToOpenAIFunction, isLangChainTool } from "@langchain/core/utils/function_calling";
import { isInteropZodSchema } from "@langchain/core/utils/types";

// Type definitions for the fix
type BindToolsInput = any;
type ToolDefinition = any;

/**
 * Fixed version of LangChain OpenAI's _convertToOpenAITool function.
 * 
 * This version properly handles both Zod schemas and JSON schemas:
 * 1. For JSON schemas: Uses LangChain's convertToOpenAIFunction() directly
 * 2. For Zod schemas: Uses OpenAI's zodFunction() if available
 * 
 * @param tool The tool to convert to OpenAI format
 * @param fields Additional fields to add to the OpenAI tool
 * @returns The tool in OpenAI tool format
 */
function fixedConvertToOpenAITool(
  tool: BindToolsInput,
  fields?: { strict?: boolean }
): ToolDefinition {
  let toolDef: ToolDefinition;
  
  if (isLangChainTool(tool)) {
    // Check if the schema is actually a Zod schema
    const isZodSchema = isInteropZodSchema(tool.schema);
    
    if (isZodSchema) {
      // For actual Zod schemas, try to use OpenAI's zodFunction if available
      try {
        // Dynamic import to avoid ES module issues
        const openaiModule = await import("openai/helpers/zod");
        const zodFunction = openaiModule.zodFunction;
        
        if (zodFunction) {
          const oaiToolDef = zodFunction({
            name: tool.name,
            parameters: tool.schema,
            description: tool.description,
          });
          
          if (oaiToolDef.function.parameters) {
            toolDef = {
              type: oaiToolDef.type,
              function: {
                name: oaiToolDef.function.name,
                description: oaiToolDef.function.description,
                parameters: oaiToolDef.function.parameters,
                ...(fields?.strict !== undefined ? { strict: fields.strict } : {}),
              },
            };
          } else {
            // Fallback to LangChain's own conversion
            toolDef = {
              type: "function",
              function: convertToOpenAIFunction(tool, fields),
            };
          }
        } else {
          throw new Error("zodFunction not found in module");
        }
      } catch (error) {
        // If zodFunction fails or isn't available, fallback to LangChain's conversion
        console.warn("OpenAI zodFunction failed, using LangChain conversion:", error);
        toolDef = {
          type: "function",
          function: convertToOpenAIFunction(tool, fields),
        };
      }
    } else {
      // For JSON schemas, use LangChain's own conversion directly
      // This avoids the bug in OpenAI's zodFunction
      toolDef = {
        type: "function",
        function: convertToOpenAIFunction(tool, fields),
      };
    }
  } else {
    // Tool is already in OpenAI format
    toolDef = tool;
  }
  
  if (fields?.strict !== undefined) {
    toolDef.function.strict = fields.strict;
  }
  
  return toolDef;
}

// Store original function for restoration
let originalFunction: any = null;

/**
 * Applies the monkey patch to fix the LangChain OpenAI integration bug.
 * Call this before using OpenAI models with DynamicStructuredTool.
 * 
 * @example
 * import { applyOpenAIIntegrationFix } from "./openai-integration-fix";
 * 
 * // Apply the fix before using OpenAI models
 * applyOpenAIIntegrationFix();
 * 
 * const llm = new ChatOpenAI({ model: "gpt-4" });
 * const agent = createReactAgent({ llm, tools });
 */
export async function applyOpenAIIntegrationFix(): Promise<void> {
  try {
    console.log("🔧 Applying OpenAI integration fix...");
    
    // Use dynamic import for ES modules compatibility
    const openaiUtilsModule = await import("@langchain/openai/dist/utils/tools.js");
    
    if (openaiUtilsModule && openaiUtilsModule._convertToOpenAITool) {
      // Store the original function for potential restoration
      originalFunction = openaiUtilsModule._convertToOpenAITool;
      
      // Replace with our fixed version
      (openaiUtilsModule as any)._convertToOpenAITool = fixedConvertToOpenAITool;
      
      console.log("✅ OpenAI integration fix applied successfully!");
    } else {
      console.warn("⚠️  Could not find _convertToOpenAITool to patch - module structure may have changed");
    }
  } catch (error) {
    console.error("❌ Failed to apply OpenAI integration fix:", error);
  }
}

/**
 * Removes the monkey patch and restores the original function.
 * Useful for testing or if you want to revert the fix.
 */
export async function removeOpenAIIntegrationFix(): Promise<void> {
  try {
    if (originalFunction) {
      const openaiUtilsModule = await import("@langchain/openai/dist/utils/tools.js");
      (openaiUtilsModule as any)._convertToOpenAITool = originalFunction;
      originalFunction = null;
      console.log("🔄 OpenAI integration fix removed - restored original function");
    } else {
      console.warn("⚠️  No fix to remove or original function not found");
    }
  } catch (error) {
    console.error("❌ Failed to remove OpenAI integration fix:", error);
  }
}
