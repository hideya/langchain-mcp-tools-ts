# OpenAI JSON Schema Adapter

Based on my research of the latest OpenAI function calling specifications, I've created an OpenAI adapter similar to your existing Gemini adapter. Here's what I found and implemented:

## Key OpenAI Requirements

1. **`strict: true`** - Required for structured outputs and reliable function calling
2. **`additionalProperties: false`** - Must be explicitly set on all object types when using strict mode
3. **Limited JSON Schema subset** - Similar to Gemini, OpenAI only supports a subset of JSON Schema
4. **No type arrays** - Must use single types only (no `["string", "null"]`)
5. **No advanced combinators** - No support for `oneOf`, `allOf`, `anyOf`, `$ref`, etc.

## What the Adapter Does

The `schema-adapter-openai.ts` provides:

### Core Functions
- `makeJsonSchemaOpenAICompatible()` - Transforms any JSON schema to OpenAI-compatible format
- `transformMcpToolForOpenAI()` - Specifically converts MCP tools to OpenAI function declarations
- `validateOpenAISchema()` - Validates schemas against OpenAI requirements
- `createOpenAITool()` - Helper to create proper OpenAI tool definitions

### Key Transformations
1. **Type arrays → Single types**: `["string", "null"]` becomes `"string"` with nullable handling
2. **Object strict mode**: Adds `additionalProperties: false` to all objects
3. **Schema combinators**: Converts `anyOf`/`oneOf`/`allOf` to simpler forms (usually first option)
4. **Reference resolution**: Resolves `$ref` and `$defs` inline
5. **Exclusive bounds**: Converts `exclusiveMinimum`/`exclusiveMaximum` to inclusive bounds
6. **Unsupported fields**: Removes fields like `nullable`, `example`, `default`, etc.

### Output Format
```typescript
{
  type: 'function',
  function: {
    name: 'tool_name',
    description: 'Tool description',
    parameters: {
      type: 'object',
      properties: { /* ... */ },
      required: ['param1'],
      additionalProperties: false
    },
    strict: true
  }
}
```

## Usage Examples

```typescript
import { transformMcpToolForOpenAI } from '@h1deya/langchain-mcp-tools';

// Convert MCP tool to OpenAI format
const mcpTool = { /* your MCP tool */ };
const result = transformMcpToolForOpenAI(mcpTool);

// Use with OpenAI API
const openAIRequest = {
  model: "gpt-4",
  messages: [{ role: "user", content: "..." }],
  tools: [result.functionDeclaration],
  tool_choice: "auto"
};
```

## Testing

You can test the adapter using:
```bash
npm run example:openai-adapter
```

This will run the example in `testfiles/openai-adapter-example.ts` which demonstrates:
- Converting a complex MCP tool schema
- Showing what transformations are applied
- Validating the result
- Example API usage structure

## Integration with Your Library

The adapter follows the same pattern as your Gemini adapter:
- Similar function signatures and return types
- Detailed transformation tracking and reporting  
- Comprehensive validation
- Easy integration with existing MCP tool workflows

You can now offer both Gemini and OpenAI schema adaptation in your library, giving users flexibility to work with either platform's specific requirements.

## Files Created

1. `src/schema-adapter-openai.ts` - Main adapter implementation
2. `testfiles/openai-adapter-example.ts` - Usage example and test
3. Updated `src/index.ts` - Exports the new functions
4. Updated `package.json` - Added example script

The adapter is ready to use and should handle the vast majority of MCP tool schemas, converting them to valid OpenAI function calling format while preserving their core functionality.
