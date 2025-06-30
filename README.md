# MCP to LangChain Tools Conversion Utility / TypeScript [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/hideya/langchain-mcp-tools-ts/blob/main/LICENSE) [![npm version](https://img.shields.io/npm/v/@h1deya/langchain-mcp-tools.svg)](https://www.npmjs.com/package/@h1deya/langchain-mcp-tools) [![network dependents](https://dependents.info/hideya/langchain-mcp-tools-ts/badge)](https://dependents.info/hideya/langchain-mcp-tools-ts)

A simple, lightweight library intended to simplify the use of
[Model Context Protocol (MCP)](https://modelcontextprotocol.io/)
server tools with LangChain.

Its simplicity and extra features for stdio MCP servers can make it useful as a basis for your own customizations.
However, it only supports text results of tool calls and does not support MCP features other than tools.

[LangChain's **official LangChain.js MCP Adapters** library](https://www.npmjs.com/package/@langchain/mcp-adapters),
which supports comprehensive integration with LangChain, has been released.
You may want to consider using it if you don't have specific needs for this library.

<a href="https://dependents.info/hideya/langchain-mcp-tools-ts">
  <img src="https://dependents.info/hideya/langchain-mcp-tools-ts/image.svg" width="400px"/>
</a>

## Introduction

This package is intended to simplify the use of
[Model Context Protocol (MCP)](https://modelcontextprotocol.io/)
server tools with LangChain / TypeScript.

[Model Context Protocol (MCP)](https://modelcontextprotocol.io/) is the de facto industry standard
that dramatically expands the scope of LLMs by enabling the integration of external tools and resources,
including DBs, GitHub, Google Drive, Docker, Slack, Notion, Spotify, and more.

There are quite a few useful MCP servers already available:

- [MCP Server Listing on the Official Site](https://github.com/modelcontextprotocol/servers?tab=readme-ov-file#model-context-protocol-servers)
- [MCP.so - Find Awesome MCP Servers and Clients](https://mcp.so/)
- [Smithery: MCP Server Registry](https://smithery.ai/)

This utility's goal is to make these numerous MCP servers easily accessible from LangChain.

It contains a utility function `convertMcpToLangchainTools()`.  
This async function handles parallel initialization of specified multiple MCP servers
and converts their available tools into an array of LangChain-compatible tools.

For detailed information on how to use this library, please refer to the following document:
- ["Supercharging LangChain: Integrating 2000+ MCP with ReAct"](https://medium.com/@h1deya/supercharging-langchain-integrating-450-mcp-with-react-d4e467cbf41a)

A Python equivalent of this utility is available
[here](https://pypi.org/project/langchain-mcp-tools)

## Prerequisites

- Node.js 18+

## Installation

```bash
npm i @h1deya/langchain-mcp-tools
```

## API docs

Can be found [here](https://hideya.github.io/langchain-mcp-tools-ts/modules.html)

## Quick Start

A minimal but complete working usage example can be found
[in this example in the langchain-mcp-tools-ts-usage repo](https://github.com/hideya/langchain-mcp-tools-ts-usage/blob/main/src/index.ts)

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
  github: {
    type: "http",
    url: "https://api.githubcopilot.com/mcp/",
    headers: {
      "Authorization": `Bearer ${process.env.GITHUB_PERSONAL_ACCESS_TOKEN}`
    }
  },
};

const { tools, cleanup } = await convertMcpToLangchainTools(mcpServers);
```

This utility function initializes all specified MCP servers in parallel,
and returns LangChain Tools
([`tools: StructuredTool[]`](https://api.js.langchain.com/classes/_langchain_core.tools.StructuredTool.html))
by gathering available MCP tools from the servers,
and by wrapping them into LangChain tools.
It also returns an async callback function (`cleanup: McpServerCleanupFn`)
to be invoked to close all MCP server sessions when finished.

The returned tools can be used with LangChain, e.g.:

```ts
// import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
const llm = new ChatGoogleGenerativeAI({ model: "gemini-2.0-flash" })

// import { createReactAgent } from "@langchain/langgraph/prebuilt";
const agent = createReactAgent({
  llm,
  tools
});
```

For hands-on experimentation with MCP server integration,
try [this MCP Client CLI tool built with this library](https://www.npmjs.com/package/@h1deya/mcp-try-cli)

## Building from Source

See [README_DEV.md](https://github.com/hideya/langchain-mcp-tools-ts/blob/main/README_DEV.md) for details.

## MCP Protocol Support

This library supports **MCP Protocol version 2025-03-26** and maintains backwards compatibility with version 2024-11-05.
It follows the [official MCP specification](https://modelcontextprotocol.io/specification/2025-03-26/) for transport selection and backwards compatibility.

### Limitations

- **Tool Return Types**: Currently, only text results of tool calls are supported.
The library uses LangChain's `response_format: 'content'` (the default), which only supports text strings.
While MCP tools can return multiple content types (text, images, etc.), this library currently filters and uses only text content.
- **MCP Features**: Only MCP [Tools](https://modelcontextprotocol.io/docs/concepts/tools) are supported. Other MCP features like Resources, Prompts, and Sampling are not implemented.

### Notes:

- **LLM Compatibility and Schema Transformations**: The library automatically performs schema transformations for LLM compatibility.
  [See below](https://github.com/hideya/langchain-mcp-tools-ts/blob/main/README.md#llm-compatibility) for details.
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

## Change Log

Can be found [here](https://github.com/hideya/langchain-mcp-tools-ts/blob/main/CHANGELOG.md)

## Appendix

### Troubleshooting

#### Common Configuration Errors

**McpInitializationError: Cannot specify both 'command' and 'url'**
- Remove either the `command` field (for URL-based servers) or the `url` field (for local stdio servers)
- Use `command` for local MCP servers, `url` for remote servers

**McpInitializationError: URL protocol to be http: or https:**
- Check that your URL starts with `http://` or `https://` when using HTTP transport
- For WebSocket servers, use `ws://` or `wss://` URLs

**McpInitializationError: command to be specified**
- Add a `command` field when using stdio transport
- Ensure the command path is correct and the executable exists

#### Transport Detection Issues

**Transport detection failed**
- Server may not support the MCP protocol correctly
- Try specifying an explicit transport type (`transport: "streamable_http"` or `transport: "sse"`)
- Check server documentation for supported transport types

**Connection timeout or network errors**
- Verify the server URL and port are correct
- Check that the server is running and accessible
- Ensure firewall/network settings allow the connection

#### Tool Execution Problems

**Schema sanitization warnings for Gemini compatibility**
- These are informational and generally safe to ignore
- Consider updating the MCP server to use Gemini-compatible schemas
- Warnings help identify servers that may need upstream fixes

**Tool calls returning empty results**
- Check server logs (use `stderr` redirection to capture them)
- Verify tool parameters match the expected schema
- Enable debug logging to see detailed tool execution information

#### Debug Steps

1. **Enable debug logging**: Set `logLevel: "debug"` to see detailed connection and execution logs
2. **Check server stderr**: For stdio MCP servers, use `stderr` redirection to capture server error output
3. **Test explicit transports**: Try forcing specific transport types to isolate auto-detection issues
4. **Verify server independently**: Test the MCP server with other clients (e.g., MCP Inspector)

#### Configuration Validation

The library validates server configurations and will throw `McpInitializationError` for invalid configurations:

- **Cannot specify both `url` and `command`**: Use `command` for local servers or `url` for remote servers
- **Transport type must match URL protocol**: e.g., `transport: "http"` requires `http:` or `https:` URL
- **Transport requires appropriate configuration**: HTTP/WS transports need URLs, stdio transport needs command

### LLM Compatibility

The library automatically handles schema compatibility for different LLM providers:

- **OpenAI Structured Outputs**:
  Makes optional fields nullable as required by OpenAI's strict specification.
  Most MCP servers use standard JSON Schema practices (optional fields without explicit nullable),
  so this transformation is applied automatically without logging.

- **Google Gemini**:
  Sanitizes schemas to remove unsupported properties like `exclusiveMinimum` and unsupported string formats.
  Schema transformations are logged at the `warn` level when changes are made,
  helping you identify which MCP servers might need upstream schema fixes for optimal Gemini compatibility.

- **Anthropic Claude**: Works with schemas as-is using standard JSON Schema validation

- **Other providers**: Generally compatible with standard JSON schemas after automatic transformations

The library handles these compatibility requirements transparently,
allowing you to use existing MCP servers with any supported LLM provider without modification.

### Resource Management

The returned `cleanup` function properly handles resource cleanup:

- Closes all MCP server connections concurrently
- Logs any cleanup failures without throwing errors
- Continues cleanup of remaining servers even if some fail
- Should always be called when done using the tools

```ts
const { tools, cleanup } = await convertMcpToLangchainTools(mcpServers);

try {
  // Use tools with your LLM
} finally {
  // Always cleanup, even if errors occur
  await cleanup();
}
```

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

See [README_DEV.md](README_DEV.md) for more information about development and testing.
