# OpenAI Integration Bug Fix

## Problem

When using `DynamicStructuredTool` with JSON schemas (not Zod schemas) with OpenAI models, you may encounter this error:

```
TypeError: Cannot read properties of undefined (reading 'typeName')
    at parseDef (/path/to/node_modules/openai/src/_vendor/zod-to-json-schema/parseDef.ts:102:53)
    at zodToJsonSchema (/path/to/node_modules/openai/src/_vendor/zod-to-json-schema/zodToJsonSchema.ts:26:5)
    at zodToJsonSchema (/path/to/node_modules/openai/src/helpers/zod.ts:16:10)
    at zodFunction (/path/to/node_modules/openai/src/helpers/zod.ts:119:21)
    at _convertToOpenAITool (/path/to/node_modules/@langchain/openai/dist/utils/tools.js:19:28)
```

## Root Cause

The bug is in the LangChain OpenAI integration. The `_convertToOpenAITool()` function tries to use OpenAI's `zodFunction()` helper for all schemas, but:

1. `zodFunction()` assumes all inputs are Zod schemas
2. It calls `zodToJsonSchema()` without type checking
3. `zodToJsonSchema()` tries to access `schema._def.typeName` on plain JSON objects
4. This causes the error when the schema is a JSON schema (not a Zod schema)

## Solution

This package provides a monkey patch that fixes the issue by:

1. Properly detecting whether a schema is a Zod schema or JSON schema
2. Using OpenAI's `zodFunction()` only for actual Zod schemas
3. Using LangChain's own `convertToOpenAIFunction()` for JSON schemas

## Usage

### Option 1: Apply the fix globally (recommended)

```typescript
import { applyOpenAIIntegrationFix } from "@h1deya/langchain-mcp-tools";

// Apply the fix BEFORE creating any OpenAI models or agents
applyOpenAIIntegrationFix();

// Now you can use OpenAI models with JSON schemas safely
const llm = new ChatOpenAI({ model: "gpt-4" });
const agent = createReactAgent({ llm, tools });
```

### Option 2: Use the Zod schema workaround

If you prefer not to use the monkey patch, you can convert your JSON schemas to Zod schemas:

```typescript
import { jsonSchemaToZod } from "@h1deya/json-schema-to-zod";

// Convert JSON schema to Zod before creating the tool
const zodSchema = jsonSchemaToZod(jsonSchema);

const tool = new DynamicStructuredTool({
  name: "my-tool",
  description: "My tool description",
  schema: zodSchema,  // Use Zod schema instead of JSON schema
  func: async (input) => { /* ... */ }
});
```

## Affected Versions

This issue affects:
- `@langchain/openai` v0.3.16 and potentially other versions
- `openai` v4.104.0 and potentially other versions

## Status

This is a temporary workaround until the upstream bug is fixed in either:
- LangChain OpenAI integration (should add proper schema type detection)
- OpenAI JavaScript SDK (should add type checking in `zodFunction()`)

Bug reports have been filed with both projects.

## Testing

You can test the fix using:

```bash
npm run example:openai-fix
```

This will run a test that reproduces the bug and demonstrates the fix working.
