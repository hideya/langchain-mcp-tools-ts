# Quick Start

This guide will help you quickly get started with the LangChain MCP Tools package.

## Basic Usage

Here's a simple example of how to use the main function `convertMcpToLangchainTools()`:

```typescript
import { convertMcpToLangchainTools } from '@h1deya/langchain-mcp-tools';
import { McpServersConfig } from '@h1deya/langchain-mcp-tools';

// Define MCP server configurations
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

async function run() {
  try {
    // Initialize MCP servers and convert to LangChain tools
    const { tools, cleanup } = await convertMcpToLangchainTools(mcpServers);
    
    console.log(`Successfully loaded ${tools.length} tools`);
    
    // Use the tools with LangChain
    // ... your LangChain code here ...
    
    // Important: Clean up the servers when done
    await cleanup();
  } catch (error) {
    console.error('Error initializing MCP servers:', error);
  }
}

run();
```

## Using with LangChain

Here's how to integrate the converted tools with a LangChain agent:

```typescript
import { convertMcpToLangchainTools } from '@h1deya/langchain-mcp-tools';
import { ChatAnthropic } from "@langchain/anthropic";
import { createReactAgent } from "@langchain/langgraph/prebuilt";

async function createAgent() {
  // Define MCP server configurations
  const mcpServers = {
    filesystem: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "."]
    }
  };

  // Initialize MCP servers and convert to LangChain tools
  const { tools, cleanup } = await convertMcpToLangchainTools(mcpServers);
  
  // Create a language model
  const llm = new ChatAnthropic({ 
    model: "claude-3-7-sonnet-latest" 
  });

  // Create a ReAct agent with the tools
  const agent = createReactAgent({
    llm,
    tools
  });
  
  return { agent, cleanup };
}

// Example usage of the agent
async function runAgent() {
  const { agent, cleanup } = await createAgent();
  
  try {
    // Use the agent
    const result = await agent.invoke({
      input: "List all files in the current directory."
    });
    
    console.log("Agent result:", result);
  } finally {
    // Always clean up when done
    await cleanup();
  }
}

runAgent();
```

## Next Steps

- Check out the [API Reference](/api/convert-function.md) for more details on the `convertMcpToLangchainTools()` function
- Explore [Advanced Configuration](/usage/advanced.md) for remote servers and other options
- See more [Examples](/examples/simple.md) for different usage scenarios
