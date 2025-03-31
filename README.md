# MCP To LangChain Tools Conversion Utility / TypeScript [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/hideya/langchain-mcp-tools-ts/blob/main/LICENSE) [![npm version](https://img.shields.io/npm/v/@h1deya/langchain-mcp-tools.svg)](https://www.npmjs.com/package/@h1deya/langchain-mcp-tools)

This package is intended to simplify the use of
[Model Context Protocol (MCP)](https://modelcontextprotocol.io/)
server tools with LangChain / TypeScript.

[Model Context Protocol (MCP)](https://modelcontextprotocol.io/),
an open source technology
[announced by Anthropic](https://www.anthropic.com/news/model-context-protocol),
dramatically expands LLM’s scope
by enabling external tool and resource integration, including
Google Drive, Slack, Notion, Spotify, Docker, PostgreSQL, and more…

Over 2000 functional components available as MCP servers:

- [MCP Server Listing on the Official Site](https://github.com/modelcontextprotocol/servers?tab=readme-ov-file#model-context-protocol-servers)
- [MCP.so - Find Awesome MCP Servers and Clients](https://mcp.so/)
- [Smithery: MCP Server Registry](https://smithery.ai/)

The goal of this utility is to make these 2000+ MCP servers readily accessible from LangChain.

It contains a utility function `convertMcpToLangchainTools()`.  
This async function handles parallel initialization of specified multiple MCP servers
and converts their available tools into an array of LangChain-compatible tools.

For detailed information on how to use this library, please refer to the following document:
- ["Supercharging LangChain: Integrating 2000+ MCP with ReAct"](https://medium.com/@h1deya/supercharging-langchain-integrating-450-mcp-with-react-d4e467cbf41a)

A python equivalent of this utility is available
[here](https://pypi.org/project/langchain-mcp-tools)

## Prerequisites

- Node.js 16+

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
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '.']
  },
  fetch: {
    command: 'uvx',
    args: ['mcp-server-fetch']
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
// import { ChatAnthropic } from '@langchain/anthropic';
const llm = new ChatAnthropic({ model: 'claude-3-7-sonnet-latest' });

// import { createReactAgent } from '@langchain/langgraph/prebuilt';
const agent = createReactAgent({
  llm,
  tools
});
```

Find complete, minimal working usage examples
[here](https://github.com/hideya/langchain-mcp-tools-ts-usage/blob/main/src/index.ts)

For hands-on experimentation with MCP server integration,
try [this LangChain application built with the utility](https://github.com/hideya/mcp-client-langchain-ts)

For detailed information on how to use this library, please refer to the following document:  
["Supercharging LangChain: Integrating 2000+ MCP with ReAct"](https://medium.com/@h1deya/supercharging-langchain-integrating-450-mcp-with-react-d4e467cbf41a)

## Limitations

Currently, only text results of tool calls are supported.

Remote MCP server is not supported.

Fatures other than [Tools](https://modelcontextprotocol.io/docs/concepts/tools) are not supported.

## Change Log

Can be found [here](https://github.com/hideya/langchain-mcp-tools-ts/blob/main/CHANGELOG.md)
