# Technical Documentation

This document captures technical issues encountered during the implementation of this library.

## 1. LLM Provider Schema Compatibility Issue

### Problem

Different LLM providers have incompatible JSON Schema requirements for function calling:

- **OpenAI requires**: Optional fields must be nullable (`.optional()` + `.nullable()`)
- **Google Gemini API**: Rejects nullable fields and requires strict OpenAPI 3.0 subset compliance
- **Anthropic Claude**: Very relaxed schema requirements with no documented restrictions

**Note**: Google Vertex AI provides OpenAI-compatible endpoints that support nullable fields.

### Real-World Impact

This creates challenges for developers trying to create universal schemas across providers.

Many MCP servers generate schemas that don't satisfy all providers' requirements.  
For example, the official Notion MCP server [@notionhq/notion-mcp-server](https://www.npmjs.com/package/@notionhq/notion-mcp-server) (as of Jul 2, 2025) produces:

**OpenAI warnings:**
```
Zod field at `#/definitions/API-get-users/properties/start_cursor` uses `.optional()` without `.nullable()` which is not supported by the API. See: https://platform.openai.com/docs/guides/structured-outputs?api-mode=responses#all-fields-must-be-required
```

**Gemini errors:**
```
GoogleGenerativeAIFetchError: [GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent: [400 Bad Request] * GenerateContentRequest.tools[0].function_declarations[0].parameters.properties[children].items.properties[paragraph].properties[rich_text].items.properties[mention].any_of[0].required: only allowed for OBJECT type
```

### Solution

This library performs provider-specific JSON schema transformations using the `llmProvider` option:

```typescript
const { tools, cleanup } = await convertMcpToLangchainTools(
  mcpServers, {
    llmProvider: "openai"        // Makes optional fields nullable
    // llmProvider: "google_gemini" // Applies Gemini's strict validation rules  
    // llmProvider: "anthropic"     // No transformations needed
  }
);
```

**Features:**
- Generates INFO-level logs when transformations are applied
- Helps users identify potential MCP server schema improvements
- Falls back to original schema when no `llmProvider` is specified

### Provider-Specific Transformations

| Provider | Transformations Applied |
|----------|------------------------|
| `openai` | Makes optional fields nullable, handles union types |
| `google_gemini` | Filters invalid required fields, fixes anyOf variants, removes unsupported features |
| `anthropic` | Accepts schemas as-is, but handles them efficiently |

For other providers, try without specifying the option:

```typescript
const { tools, cleanup } = await convertMcpToLangchainTools(
  mcpServers
);
```

### References

- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)
- [Gemini API Schema Requirements](https://ai.google.dev/api/caching#Schema)
- [Anthropic Tool Use](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/overview)
