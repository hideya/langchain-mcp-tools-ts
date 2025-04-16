# LangChain MCP Tools - TypeScript

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/hideya/langchain-mcp-tools-ts/blob/main/LICENSE) [![npm version](https://img.shields.io/npm/v/@h1deya/langchain-mcp-tools.svg)](https://www.npmjs.com/package/@h1deya/langchain-mcp-tools)

This package simplifies the use of [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server tools with LangChain in TypeScript.

## What is MCP?

[Model Context Protocol (MCP)](https://modelcontextprotocol.io/) is an open source technology [announced by Anthropic](https://www.anthropic.com/news/model-context-protocol) that dramatically expands LLM capabilities by enabling integration with external tools and resources including:

- Google Drive
- Slack
- Notion
- Spotify
- Docker
- PostgreSQL
- And many more...

## Why This Utility?

Over 2000 functional components are available as MCP servers:

- [MCP Server Listing on the Official Site](https://github.com/modelcontextprotocol/servers?tab=readme-ov-file#model-context-protocol-servers)
- [MCP.so - Find Awesome MCP Servers and Clients](https://mcp.so/)
- [Smithery: MCP Server Registry](https://smithery.ai/)

The goal of this utility is to make these 2000+ MCP servers readily accessible from LangChain by:

1. Handling parallel initialization of multiple MCP servers
2. Converting their available tools into LangChain-compatible tools
3. Providing a clean, simple interface for TypeScript developers

## Key Features

- **Simple API**: One main function `convertMcpToLangchainTools()` does all the heavy lifting
- **Parallel Processing**: Initializes multiple MCP servers simultaneously
- **TypeScript Support**: Full TypeScript definitions for type safety
- **LangChain Integration**: Creates tools that work seamlessly with LangChain agents
- **Resource Management**: Provides cleanup function to properly close server connections

## Quick Links

- [Installation Guide](/getting-started/installation.md)
- [Quick Start](/getting-started/quick-start.md)
- [API Reference](/api/convert-function.md)
- [Usage Examples](/examples/simple.md)

## External Resources

For detailed information on how to use this library, please refer to the following article:
- ["Supercharging LangChain: Integrating 2000+ MCP with ReAct"](https://medium.com/@h1deya/supercharging-langchain-integrating-450-mcp-with-react-d4e467cbf41a)

A Python equivalent of this utility is available [here](https://pypi.org/project/langchain-mcp-tools).
