# Technical Documentation

This document captures technical issues encountered during the implementation of this library.

## 1. LLM Provider Schema Compatibility Issue

### Incompatibility

The incompatibility exists primarily between:
- OpenAI's structured outputs approach
- Google's Gemini API (not Vertex AI) function calling schemas

The incompatibility is:
- **OpenAI requires**: `required: true` + `nullable: true` (via union types)
- **Google Gemini API**: rejects `nullable: true` in function calling

  Note that **Google Vertex AI** provides API endpoints that support `nullable: true` (e.g. OpenAI-compatible endpoint) 

For details:
- OpenAI function calling requirements:
  https://platform.openai.com/docs/guides/function-calling

- Gemini's OpenAPI subset requirement for function declarations:
  https://ai.google.dev/api/caching#Schema

### Issue

This creates challenges for developers trying to create universal schemas
that work across both OpenAI and Google Gemini API.

In addition, there are MCP servers that have issues with those requirements/restrictions.

For example, the official Notion MCP server
[@notionhq/notion-mcp-server](https://www.npmjs.com/package/@notionhq/notion-mcp-server)
generates many warnings like the following with OpenAI's LLMs (as of Jul 2, 2025):

```
Zod field at `#/definitions/API-get-users/properties/start_cursor` uses `.optional()` without `.nullable()` which is not supported by the API. See: https://platform.openai.com/docs/guides/structured-outputs?api-mode=responses#all-fields-must-be-required
...
```

Besides Gemini fails to work with it with the following error:

```
GoogleGenerativeAIFetchError: [GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent: [400 Bad Request] Invalid JSON payload received. Unknown name "const" at 'tools[0].function_declarations[6].parameters.properties[1].value.items.properties[0].value.properties[0].value.items.properties[1].value': Cannot find field.
...
    at handleResponseNotOk (file:///Users/hideya/Desktop/WS/AT/langchain-mcp-tools-ts/node_modules/@google/generative-ai/dist/index.mjs:432:11)
    ...
```

Becasue we cannot generate a universal schema that satisfies the requirements by OpenAI and Gemini,
the schema issue needs to be handled specific to the model provider.

### Solution

The approach taken by this library is to perofrm JSON schema adjustments to satisfy the target provider.

A new option `llmProver` has been introduced so that `convertMcpToLangchainTools()` can convert
MCP tool schema acordingly when to convert MCP tools into LangChain-compatible tools.

```
    const { tools, cleanup } = await convertMcpToLangchainTools(
      mcpServers, {
        llmProvider: "openai"
        // llmProvider: "google_gemini" // or `llmProvider: "google_genai"`
        // llmProvider: "anthropic"
      }
    );
```

It generates log output at the INFO level when any converstion is performed,
so that the user can notice necessary adjustment in the MCP server schema.

When the option is not given, it uses the schema as is:

```
    const { tools, cleanup } = await convertMcpToLangchainTools(
      mcpServers
    );
```
