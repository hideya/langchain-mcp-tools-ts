# Installation

This guide will help you install and set up the LangChain MCP Tools package in your TypeScript project.

## Prerequisites

Before installing this package, make sure you have:

- Node.js 16 or higher
- npm or yarn package manager
- A TypeScript project with LangChain already set up (recommended)

## Install the Package

You can install the package using npm:

```bash
npm install @h1deya/langchain-mcp-tools
```

Or using yarn:

```bash
yarn add @h1deya/langchain-mcp-tools
```

## MCP Servers

This package doesn't include the MCP servers themselves. You'll need to install or have access to the specific MCP servers that you want to use. Most MCP servers can be installed via npm or other package managers.

### Common MCP Servers

Here are some commonly used MCP servers and how to install them:

#### Filesystem MCP Server

```bash
npm install -g @modelcontextprotocol/server-filesystem
```

#### Fetch MCP Server

```bash
npm install -g uvx
# Then you can run:
# uvx mcp-server-fetch
```

## Verify Installation

After installation, you can verify that everything is working by creating a simple test file:

```typescript
import { convertMcpToLangchainTools } from '@h1deya/langchain-mcp-tools';

// Test function
async function testInstallation() {
  console.log('LangChain MCP Tools package is installed correctly!');
  
  // If you have MCP servers installed, you can test further:
  // const mcpServers = {
  //   filesystem: {
  //     command: "npx",
  //     args: ["-y", "@modelcontextprotocol/server-filesystem", "."]
  //   }
  // };
  // 
  // try {
  //   const { tools, cleanup } = await convertMcpToLangchainTools(mcpServers);
  //   console.log(`Successfully loaded ${tools.length} tools`);
  //   await cleanup();
  // } catch (error) {
  //   console.error('Error initializing MCP servers:', error);
  // }
}

testInstallation();
```

## Next Steps

Now that you have installed the package, proceed to the [Quick Start Guide](/getting-started/quick-start.md) to learn how to use it.
