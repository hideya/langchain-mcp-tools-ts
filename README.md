# MCP To LangChain Tools Conversion Utility / TypeScript [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/hideya/langchain-mcp-tools-ts/blob/main/LICENSE) [![npm version](https://img.shields.io/npm/v/@h1deya/langchain-mcp-tools.svg)](https://www.npmjs.com/package/@h1deya/langchain-mcp-tools)

This is a simple, lightweight library intended to simplify the use of
[Model Context Protocol (MCP)](https://modelcontextprotocol.io/)
server tools with LangChain.
Its simplicity and extra features for stdio MCP servers can make it useful as a basis for your own customizations.
However, it only supports text results of tool calls and does not support MCP features other than tools.

LangChain's **official LangChain.js MCP Adapters** library,
which supports comprehensive integration with LangChain, has been released at:
- npmjs: https://www.npmjs.com/package/@langchain/mcp-adapters
- github: https://github.com/langchain-ai/langchainjs/tree/main/libs/langchain-mcp-adapters`

You may want to consider using the above if you don't have specific needs for this library.

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

This utility's goal is to make these massive numbers of MCP servers easily accessible from LangChain.

It contains a utility function `convertMcpToLangchainTools()`.  
This async function handles parallel initialization of specified multiple MCP servers
and converts their available tools into an array of LangChain-compatible tools.

For detailed information on how to use this library, please refer to the following document:
- ["Supercharging LangChain: Integrating 2000+ MCP with ReAct"](https://medium.com/@h1deya/supercharging-langchain-integrating-450-mcp-with-react-d4e467cbf41a)

A python equivalent of this utility is available
[here](https://pypi.org/project/langchain-mcp-tools)

## Prerequisites

- Node.js 16+

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
  }
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
// import { ChatAnthropic } from "@langchain/anthropic";
const llm = new ChatAnthropic({ model: "claude-sonnet-4-0" });

// import { createReactAgent } from "@langchain/langgraph/prebuilt";
const agent = createReactAgent({
  llm,
  tools
});
```

For hands-on experimentation with MCP server integration,
try [this LangChain application built with the utility](https://github.com/hideya/mcp-client-langchain-ts)

For detailed information on how to use this library, please refer to the following document:  
["Supercharging LangChain: Integrating 2000+ MCP with ReAct"](https://medium.com/@h1deya/supercharging-langchain-integrating-450-mcp-with-react-d4e467cbf41a)

## Experimental Features

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
    },

    // Explicit SSE
    "sse-server-name": {
        url: `http://${sse_server_host}:${sse_server_port}/...`,
        transport: "sse"
    },

    // WebSocket
    "ws-server-name": {
        url: `ws://${ws_server_host}:${ws_server_port}/...`
    },
```

**Auto-detection behavior (default):**
- For HTTP/HTTPS URLs without explicit `transport`, the library follows [MCP specification recommendations](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#backwards-compatibility)
- First attempts Streamable HTTP transport
- If Streamable HTTP fails with a 4xx error, automatically falls back to SSE transport
- Non-4xx errors (network issues, etc.) are re-thrown without fallback

**Understanding Streamable HTTP vs SSE Transport:**

Streamable HTTP is the modern MCP transport that replaces the older HTTP+SSE transport. According to the [official MCP documentation](https://modelcontextprotocol.io/docs/concepts/transports):

> **"SSE as a standalone transport is deprecated as of protocol version 2024-11-05. It has been replaced by Streamable HTTP, which incorporates SSE as an optional streaming mechanism."**

Key differences:

**Streamable HTTP (Modern, Recommended):**
- **Single Endpoint**: Both POST and GET requests are handled via one endpoint (e.g., `/mcp`)
- **Flexible Streaming**: Server can respond with standard HTTP responses OR upgrade to Server-Sent Events (SSE) when streaming is needed
- **Optional SSE**: Unlike the old transport, SSE is not required for every interaction
- **Efficient**: Avoids persistent connections when simple request-response is sufficient

**SSE Transport (Deprecated):**
- Required separate endpoints for different message types
- Always used persistent SSE connections for server-to-client messages
- Less flexible and potentially less efficient

When you see SSE activity in logs (like `Accept: text/event-stream`), this is the MCP SDK choosing to use SSE for streaming server responses within the Streamable HTTP transport - it's an implementation choice, not a protocol requirement.

**Explicit transport selection:**
- Set `transport: "streamable_http"` to force Streamable HTTP (no fallback)
- Set `transport: "sse"` to force SSE transport
- WebSocket URLs (`ws://` or `wss://`) always use WebSocket transport

Note that the key `"url"` may be changed in the future to match
the MCP server configurations used by Claude for Desktop once
it introduces remote server support.

A usage example can be found [here](
https://github.com/hideya/langchain-mcp-tools-ts-usage/blob/694b877ed5336bfcd5274d95d3f6d14bed0937a6/src/index.ts#L26-L38)

### Authentication Support for Streamable HTTP Connections

The library supports authentication for Streamable HTTP connections (the modern, recommended transport):

```ts
import { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';

// Implement your own OAuth client provider
class MyOAuthProvider implements OAuthClientProvider {
  // Implementation details...
}

const mcpServers = {
  "secure-streamable-server": {
    url: "https://secure-mcp-server.example.com/mcp",
    transport: "streamable_http",  // Optional: explicit transport
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

### Authentication Support for SSE Connections (Legacy)

The library also supports authentication for SSE connections to MCP servers.
Note that SSE transport is deprecated; Streamable HTTP is the recommended approach.

To enable authentication, provide SSE options in your server configuration:

```ts
import { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';

// Implement your own OAuth client provider
class MyOAuthProvider implements OAuthClientProvider {
  // Implementation details...
}

const mcpServers = {
  "secure-server": {
    url: "https://secure-mcp-server.example.com",
    sseOptions: {
      // Provide an OAuth client provider
      authProvider: new MyOAuthProvider(),
      
      // Optionally customize the initial SSE request
      eventSourceInit: {
        // Custom options
      },
      
      // Optionally customize recurring POST requests
      requestInit: {
        headers: {
          'X-Custom-Header': 'custom-value'
        }
      }
    }
  }
};
```

**Testing Authentication:**

Example implementations and test servers are provided:

- **Streamable HTTP Authentication** (Recommended): Test servers and clients for modern transport
- **SSE Authentication** (Legacy): Test servers and clients for deprecated transport

To test:
```bash
# Test modern Streamable HTTP authentication:
# Terminal 1: Start Streamable HTTP auth test server
npm run test:streamable:auth:server

# Terminal 2: Run Streamable HTTP auth test client
npm run test:streamable:auth:client

# Test legacy SSE authentication:
# Terminal 1: Start SSE auth test server
npm run test:sse:server

# Terminal 2: Run SSE auth test client
npm run test:sse:client
```

## Limitations

- Currently, only text results of tool calls are supported.
- MCP features other than [Tools](https://modelcontextprotocol.io/docs/concepts/tools) are not supported.

## Change Log

Can be found [here](https://github.com/hideya/langchain-mcp-tools-ts/blob/main/CHANGELOG.md)
