# MCP To LangChain Tools Conversion Utility / TypeScript [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/hideya/langchain-mcp-tools-ts/blob/main/LICENSE) [![npm version](https://img.shields.io/npm/v/@h1deya/langchain-mcp-tools.svg)](https://www.npmjs.com/package/@h1deya/langchain-mcp-tools)

## NOTE

LangChain's **official LangChain.js MCP Adapters** library has been released at:
- npmjs: https://www.npmjs.com/package/@langchain/mcp-adapters
- github: https://github.com/langchain-ai/langchainjs/tree/main/libs/langchain-mcp-adapters`

This library is very simple and lightweight.
It only supports text results of tool calls, and it does not support MCP features other than Tools.  
You may want to consider using the above if you don't have specific needs for this library...

## Introduction

This package is intended to simplify the use of
[Model Context Protocol (MCP)](https://modelcontextprotocol.io/)
server tools with LangChain / TypeScript.

[Model Context Protocol (MCP)](https://modelcontextprotocol.io/),
an open standard
[announced by Anthropic](https://www.anthropic.com/news/model-context-protocol),
dramatically expands LLM's scope
by enabling external tool and resource integration, including
GitHub, Google Drive, Slack, Notion, Spotify, Docker, PostgreSQL, and more…

MCP is likely to become the de facto industry standard as 
[OpenAI has announced its adoption](https://techcrunch.com/2025/03/26/openai-adopts-rival-anthropics-standard-for-connecting-ai-models-to-data).

Over 2000 functional components available as MCP servers:

- [MCP Server Listing on the Official Site](https://github.com/modelcontextprotocol/servers?tab=readme-ov-file#model-context-protocol-servers)
- [MCP.so - Find Awesome MCP Servers and Clients](https://mcp.so/)
- [Smithery: MCP Server Registry](https://smithery.ai/)

The goal of this utility is to make these 2000+ MCP servers readily accessible from LangChain.

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

**Explicit transport selection:**
- Set `transport: "streamable_http"` to force Streamable HTTP (no fallback)
- Set `transport: "sse"` to force SSE transport
- WebSocket URLs (`ws://` or `wss://`) always use WebSocket transport

Note that the key `"url"` may be changed in the future to match
the MCP server configurations used by Claude for Desktop once
it introduces remote server support.

A usage example can be found [here](
https://github.com/hideya/langchain-mcp-tools-ts-usage/blob/694b877ed5336bfcd5274d95d3f6d14bed0937a6/src/index.ts#L26-L38)

### Authentication Support for SSE Connections

The library now supports authentication for SSE connections to MCP servers.
This is particularly useful for accessing authenticated MCP servers that require OAuth 2.0.

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

### Authentication Support for Streamable HTTP Connections

Similarly, the library supports authentication for Streamable HTTP connections:

```ts
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

**Testing Authentication:**

Example implementations and test servers are provided:

- **SSE Authentication**: `sse-auth-test-server.ts` and `sse-auth-test-client.ts`
- **Streamable HTTP Authentication**: `streamable-http-auth-test-server.ts` and `streamable-http-auth-test-client.ts`

To test:
```bash
# Terminal 1: Start SSE auth test server
npm run sse-auth-test-server

# Terminal 2: Run SSE auth test client
npm run sse-auth-test-client

# Or test Streamable HTTP authentication:
# Terminal 1: Start Streamable HTTP auth test server
npm run streamable-http-auth-test-server

# Terminal 2: Run Streamable HTTP auth test client
npm run streamable-http-auth-test-client
```

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

## Limitations

- Currently, only text results of tool calls are supported.
- MCP features other than [Tools](https://modelcontextprotocol.io/docs/concepts/tools) are not supported.

## Change Log

Can be found [here](https://github.com/hideya/langchain-mcp-tools-ts/blob/main/CHANGELOG.md)
