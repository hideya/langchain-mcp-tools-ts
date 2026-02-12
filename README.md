# MCP to LangChain Tools Conversion Utility / TypeScript [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/hideya/langchain-mcp-tools-ts/blob/main/LICENSE) [![npm version](https://img.shields.io/npm/v/@h1deya/langchain-mcp-tools.svg)](https://www.npmjs.com/package/@h1deya/langchain-mcp-tools) [![network dependents](https://dependents.info/hideya/langchain-mcp-tools-ts/badge)](https://dependents.info/hideya/langchain-mcp-tools-ts)

A simple, lightweight library to use 
[Model Context Protocol (MCP)](https://modelcontextprotocol.io/)
server tools from LangChain.

<img width="500px" alt="langchain-mcp-tools-diagram" src="https://raw.githubusercontent.com/hideya/langchain-mcp-tools-py/refs/heads/main/docs/images/langchain-mcp-tools-diagram.png" />

Its simplicity and extra features, such as
[tools schema adjustments for LLM compatibility](https://github.com/hideya/langchain-mcp-tools-ts/blob/main/README.md#llm-provider-schema-compatibility)
and [tools invocation logging](https://github.com/hideya/langchain-mcp-tools-ts/blob/main/README.md#debugging-and-logging),
make it a useful basis for your experiments and customizations.
However, it only supports text results of tool calls and does not support MCP features other than Tools.

[LangChain's **official LangChain.js MCP Adapters** library](https://www.npmjs.com/package/@langchain/mcp-adapters),
which supports comprehensive integration with LangChain, has been released.
You might want to consider using it if the extra features that this library supports are not necessary.

## Prerequisites

- Node.js 18+

## Installation

```bash
npm i @h1deya/langchain-mcp-tools
```

## Quick Start

`convertMcpToLangchainTools()` utility function accepts MCP server configurations
that follow the same structure as
[Claude for Desktop](https://modelcontextprotocol.io/quickstart/user),
but only the contents of the `mcpServers` property,
and is expressed as a JS Object, e.g.:

```ts
const mcpServers: McpServersConfig = {
  filesystem: {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "."]
  },
  fetch: {
    command: "uvx",
    args: ["mcp-server-fetch"]
  },
  "brave-search": {
    command: "npx",
    args: [ "-y", "@modelcontextprotocol/server-brave-search"],
    env: { "BRAVE_API_KEY": `${process.env.BRAVE_API_KEY}` }
  },
  github: {
    type: "http",
    url: "https://api.githubcopilot.com/mcp/",
    headers: {
      "Authorization": `Bearer ${process.env.GITHUB_PERSONAL_ACCESS_TOKEN}`
    }
  },
  notion: {  // For MCP servers that require OAuth, consider using "mcp-remote"
    command: "npx",
    args: ["-y", "mcp-remote", "https://mcp.notion.com/mcp"],
  },
};

const { tools, cleanup } = await convertMcpToLangchainTools(
  mcpServers, {
    // Perform provider-specific JSON schema transformations to prevent schema compatibility issues
    llmProvider: "google_gemini"
    // llmProvider: "openai"
    // llmProvider: "anthropic"  // no transformations
    // llmProvider: "xai"  // no transformations
    // llmProvider: "none"  // for others (default)
  }
);
```

This utility function initializes all specified MCP servers in parallel,
and returns LangChain Tools
([`tools: StructuredTool[]`](https://api.js.langchain.com/classes/_langchain_core.tools.StructuredTool.html))
by gathering available MCP tools from the servers,
and by wrapping them into LangChain tools.

When `llmProvider` option is specified, it performs LLM provider-specific schema transformations
for MCP tools to prevent schema compatibility issues.
Set this option when you enconter schema related warnings/errors while execution.  
[See below](https://github.com/hideya/langchain-mcp-tools-ts/blob/main/README.md#llm-provider-schema-compatibility) for details.

It also returns an async callback function (`cleanup: McpServerCleanupFn`)
to be invoked to close all MCP server sessions when finished.

The returned tools can be used with LangChain, e.g.:

```ts
// import { createAgent } from "langchain";
const model = new ChatGoogleGenerativeAI({ model: "gemini-2.5-flash" });

// import { createReactAgent } from "@langchain/langgraph/prebuilt";
const agent = createAgent({
  model,
  tools
});
```

The returned `cleanup` function properly handles resource cleanup:

- Closes all MCP server connections concurrently and logs any cleanup failures
- Continues cleanup of remaining servers even if some fail
- Should always be called when done using the tools

It is typically invoked in a finally block:

```ts
const { tools, cleanup } = await convertMcpToLangchainTools(mcpServers);

try {
  // Use tools with your LLM
} finally {
  // Always cleanup, even if errors occur
  await cleanup();
}
```

A minimal but complete working usage example can be found
[in this example in the langchain-mcp-tools-ts-usage repo](https://github.com/hideya/langchain-mcp-tools-ts-usage/blob/main/src/index.ts)

For hands-on experimentation with MCP server integration,
try [this MCP Client CLI tool built with this library](https://www.npmjs.com/package/@h1deya/mcp-client-cli)

A Python equivalent of this utility is available
[here](https://pypi.org/project/langchain-mcp-tools)

## Introduction

This package is intended to simplify the use of
[Model Context Protocol (MCP)](https://modelcontextprotocol.io/)
server tools with LangChain / TypeScript.

[Model Context Protocol (MCP)](https://modelcontextprotocol.io/) is the de facto industry standard
that dramatically expands the scope of LLMs by enabling the integration of external tools and resources,
including DBs, Cloud Storages, GitHub, Docker, Slack, and more.
There are quite a few useful MCP servers already available.  
See [MCP Server Listing on the Official Site](https://github.com/modelcontextprotocol/servers?tab=readme-ov-file#model-context-protocol-servers).

This utility's goal is to make these numerous MCP servers easily accessible from LangChain.  
It contains a utility function `convertMcpToLangchainTools()`.  
This async function handles parallel initialization of specified multiple MCP servers
and converts their available tools into an array of LangChain-compatible tools.
It also performs LLM provider-specific schema transformations
to prevent [schema compatibility issues](https://github.com/hideya/langchain-mcp-tools-ts/blob/main/README.md#llm-provider-schema-compatibility)

For detailed information on how to use this library, please refer to the following document:
["Supercharging LangChain: Integrating 2000+ MCP with ReAct"](https://medium.com/@h1deya/supercharging-langchain-integrating-450-mcp-with-react-d4e467cbf41a).

## MCP Protocol Support

This library supports **MCP Protocol version 2025-03-26** and maintains backwards compatibility with version 2024-11-05.
It follows the [official MCP specification](https://modelcontextprotocol.io/specification/2025-03-26/) for transport selection and backwards compatibility.

### Limitations

- **Tool Return Types**: Currently, only text results of tool calls are supported.
The library uses LangChain's `response_format: 'content'` (the default), which only supports text strings.
While MCP tools can return multiple content types (text, images, etc.), this library currently filters and uses only text content.
- **MCP Features**: Only MCP [Tools](https://modelcontextprotocol.io/docs/concepts/tools) are supported. Other MCP features like Resources, Prompts, and Sampling are not implemented.

### Notes

- **LLM Compatibility and Schema Transformations**: The library can perform schema transformations for LLM compatibility.
  [See below](https://github.com/hideya/langchain-mcp-tools-ts/blob/main/README.md#llm-provider-schema-compatibility) for details.
- **Passing PATH Env Variable**: The library automatically adds the `PATH` environment variable to stdio server configrations if not explicitly provided to ensure servers can find required executables.

## Features

### `stderr` Redirection for Local MCP Server 

A new key `"stderr"` has been introduced to specify a file descriptor
to which local (stdio) MCP server's stderr is redirected.  
The key name `stderr` is derived from
TypeScript SDK's [`StdioServerParameters`](https://github.com/modelcontextprotocol/typescript-sdk/blob/131776764536b5fdca642df51230a3746fb4ade0/src/client/stdio.ts#L32).

```ts
    const logPath = `mcp-server-${serverName}.log`;
    const logFd = fs.openSync(logPath, "w");
    mcpServers[serverName].stderr = logFd;
```

A usage example can be found [here](
https://github.com/hideya/langchain-mcp-tools-ts-usage/blob/694b877ed5336bfcd5274d95d3f6d14bed0937a6/src/index.ts#L72-L83)

### Working Directory Configuration for Local MCP Servers

The working directory that is used when spawning a local (stdio) MCP server
can be specified with the `"cwd"` key as follows:

```ts
    "local-server-name": {
      command: "...",
      args: [...],
      cwd: "/working/directory"  // the working dir to be use by the server
    },
```

The key name `cwd` is derived from
TypeScript SDK's [`StdioServerParameters`](https://github.com/modelcontextprotocol/typescript-sdk/blob/131776764536b5fdca642df51230a3746fb4ade0/src/client/stdio.ts#L39).

### Transport Selection Priority

The library selects transports using the following priority order:

1. **Explicit transport/type field** (must match URL protocol if URL provided)
2. **URL protocol auto-detection** (http/https → StreamableHTTP → SSE, ws/wss → WebSocket)
3. **Command presence** → Stdio transport
4. **Error** if none of the above match

This ensures predictable behavior while allowing flexibility for different deployment scenarios.

### Remote MCP Server Support

`mcp_servers` configuration for Streamable HTTP, SSE and Websocket servers are as follows:

```ts
    // Auto-detection: tries Streamable HTTP first, falls back to SSE on 4xx errors
    "auto-detect-server": {
        url: `http://${server_host}:${server_port}/...`
    },

    // Explicit Streamable HTTP
    "streamable-http-server": {
        url: `http://${server_host}:${server_port}/...`,
        transport: "streamable_http"
        // type: "http"  // VSCode-style config also works instead of the above
    },

    // Explicit SSE
    "sse-server-name": {
        url: `http://${sse_server_host}:${sse_server_port}/...`,
        transport: "sse"  // or `type: "sse"`
    },

    // WebSocket
    "ws-server-name": {
        url: `ws://${ws_server_host}:${ws_server_port}/...`
        // optionally `transport: "ws"` or `type: "ws"`
    },
```

For the convenience of adding authorization headers, the following shorthand expression is supported.
This header configuration will be overridden if either `streamableHTTPOptions` or `sseOptions` is specified (details below).

```ts
    github: {
      // To avoid auto protocol fallback, specify the protocol explicitly when using authentication
      type: "http",  // or `transport: "http",`
      url: "https://api.githubcopilot.com/mcp/",
      headers: {
        "Authorization": `Bearer ${process.env.GITHUB_PERSONAL_ACCESS_TOKEN}`
      }
    },
```

NOTE: When accessing the GitHub MCP server, [GitHub PAT (Personal Access Token)](https://github.com/settings/personal-access-tokens)
alone is not enough; your GitHub account must have an active Copilot subscription or be assigned a Copilot license through your organization.

**Auto-detection behavior (default):**
- For HTTP/HTTPS URLs without explicit `transport`, the library follows [MCP specification recommendations](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#backwards-compatibility)
- First attempts Streamable HTTP transport
- If Streamable HTTP fails with a 4xx error, automatically falls back to SSE transport
- Non-4xx errors (network issues, etc.) are re-thrown without fallback

**Explicit transport selection:**
- Set `transport: "streamable_http"` (or VSCode-style config `type: "http"`) to force Streamable HTTP (no fallback)
- Set `transport: "sse"` to force SSE transport
- WebSocket URLs (`ws://` or `wss://`) always use WebSocket transport

Streamable HTTP is the modern MCP transport that replaces the older HTTP+SSE transport. According to the [official MCP documentation](https://modelcontextprotocol.io/docs/concepts/transports): "SSE as a standalone transport is deprecated as of protocol version 2025-03-26. It has been replaced by Streamable HTTP, which incorporates SSE as an optional streaming mechanism."

### Accessing Remote MCP Servers with OAuth Quickly

If you need to use MCP servers that require OAuth, consider using **"[mcp-remote](https://www.npmjs.com/package/mcp-remote)"**.

```ts
    notion: {
      command: "npx",
      args: ["-y", "mcp-remote", "https://mcp.notion.com/mcp"],
    },
```

### Authentication Support for Streamable HTTP Connections

The library supports OAuth 2.1 authentication for Streamable HTTP connections:

```ts
import { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';

// Implement your own OAuth client provider
class MyOAuthProvider implements OAuthClientProvider {
  // Implementation details...
}

const mcpServers = {
  "secure-streamable-server": {
    url: "https://secure-mcp-server.example.com/mcp",
    // To avoid auto protocol fallback, specify the protocol explicitly when using authentication
    transport: "streamable_http",  // or `type: "http",`
    streamableHTTPOptions: {
      // Provide an OAuth client provider
      authProvider: new MyOAuthProvider(),
      
      // Optionally customize HTTP requests
      requestInit: {
        headers: {
          'X-Custom-Header': 'custom-value'
        }
      },
      
      // Optionally configure reconnection behavior
      reconnectionOptions: {
        maxReconnectAttempts: 5,
        reconnectDelay: 1000
      }
    }
  }
};
```

Test implementations are provided:

- **Streamable HTTP Authentication Tests**:
  - MCP client uses this library: [streamable-http-auth-test-client.ts](https://github.com/hideya/langchain-mcp-tools-ts/tree/main/testfiles/streamable-http-auth-test-client.ts)
  - Test MCP Server:  [streamable-http-auth-test-server.ts](https://github.com/hideya/langchain-mcp-tools-ts/tree/main/testfiles/streamable-http-auth-test-server.ts)

## API docs

Can be found [here](https://hideya.github.io/langchain-mcp-tools-ts/modules.html)

## Change Log

Can be found [here](https://github.com/hideya/langchain-mcp-tools-ts/blob/main/CHANGELOG.md)

## Building from Source

See [README_DEV.md](https://github.com/hideya/langchain-mcp-tools-ts/blob/main/README_DEV.md) for details.

## Appendix

### Troubleshooting

1. **Enable debug logging**: Set `logLevel: "debug"` to see detailed connection and execution logs
2. **Check server stderr**: For stdio MCP servers, use `stderr` redirection to capture server error output
3. **Test explicit transports**: Try forcing specific transport types to isolate auto-detection issues
4. **Verify server independently**: Refer to [Debugging Section in MCP documentation](https://modelcontextprotocol.io/docs/tools/debugging)

### Debugging Authentication

1. **Check your tokens/credentials** - Most auth failures are due to expired or incorrect tokens
2. **Verify token permissions** - Some MCP servers require specific scopes (e.g., GitHub Copilot license)
3. **Test with curl** - Try a simple HTTP request to verify your auth setup:

   ```bash
   curl -H "Authorization: Bearer your-token" https://api.example.com/mcp/
   ```

### LLM Provider Schema Compatibility

Different LLM providers have incompatible JSON Schema requirements for function calling:

- **OpenAI requires**: Optional fields must be nullable (`.optional()` + `.nullable()`)
  for function calling (based on Structured Outputs API requirements,
  strict enforcement coming in future SDK versions)
- **Google Gemini API**: Rejects nullable fields and `$defs` references, requires strict OpenAPI 3.0 subset compliance
- **Anthropic Claude** and **xAI Grok**: Very relaxed schema requirements with no documented restrictions

**Note**: Google Vertex AI provides OpenAI-compatible endpoints that support more relaxed requirements.

#### Real-World Impact

This creates challenges for developers trying to create universal schemas across providers.

Some MCP servers generate schemas that don't satisfy all providers' requirements.  
For example, the official Notion local MCP server [@notionhq/notion-mcp-server](https://www.npmjs.com/package/@notionhq/notion-mcp-server) (version 1.9.0) and the remote server (at "https://mcp.notion.com/mcp", mcp-remote 0.1.18) produces:

**OpenAI Warnings:**
```
Zod field at `#/definitions/read_file/properties/tail` uses `.optional()` without `.nullable()` which is not supported by the API. See: https://platform.openai.com/docs/guides/structured-outputs?api-mode=responses#all-fields-must-be-required
... followed by many more
```

**Gemini Errors:**
```
[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent: [400 Bad Request] Invalid JSON payload received. Unknown name "exclusiveMaximum" at 'tools[0].function_declarations[14].parameters.properties[1].value': Cannot find field.
... followed by many more
```

#### Solution

The new option, `llmProvider`, has been introduced for performing provider-specific JSON schema transformations:

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

#### Provider-Specific Transformations

| Provider | Transformations Applied |
|----------|------------------------|
| `openai` | Makes optional fields nullable, handles union types |
| `google_gemini` or `google_genai` | Filters invalid required fields, fixes anyOf variants, removes unsupported features |
| `anthropic` and `xai` | No transformations, but the schemas are handled slightly more efficiently |

For other providers, try without specifying the option:

```typescript
const { tools, cleanup } = await convertMcpToLangchainTools(
  mcpServers
);
```

#### References

- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)
- [Gemini API Schema Requirements](https://ai.google.dev/api/caching#Schema)
- [Anthropic Tool Use](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/overview)

### Debugging and Logging

The library provides configurable logging to help debug connection and tool execution issues:

```ts
// Configure log level
const { tools, cleanup } = await convertMcpToLangchainTools(
  mcpServers, 
  { logLevel: "debug" }
);

// Use custom logger
class MyLogger implements McpToolsLogger {
  debug(...args: unknown[]) { console.log("[DEBUG]", ...args); }
  info(...args: unknown[]) { console.log("[INFO]", ...args); }
  warn(...args: unknown[]) { console.warn("[WARN]", ...args); }
  error(...args: unknown[]) { console.error("[ERROR]", ...args); }
}

const { tools, cleanup } = await convertMcpToLangchainTools(
  mcpServers,
  { logger: new MyLogger() }
);
```

Available log levels: `"fatal" | "error" | "warn" | "info" | "debug" | "trace"`

### For Developers

See [README_DEV.md](https://github.com/hideya/langchain-mcp-tools-ts/blob/main/README_DEV.md)
for more information about development and testing.
