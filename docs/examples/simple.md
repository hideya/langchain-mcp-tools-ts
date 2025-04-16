# Simple Example

This example demonstrates how to use the LangChain MCP Tools package with a basic setup.

## Prerequisites

- Node.js 16+
- The following npm packages installed:
  - `@h1deya/langchain-mcp-tools`
  - `@langchain/core`
  - `@langchain/anthropic` (or another LLM provider)
  - `@langchain/langgraph`

## Basic Example

```typescript
import { convertMcpToLangchainTools } from '@h1deya/langchain-mcp-tools';
import { ChatAnthropic } from "@langchain/anthropic";
import { createReactAgent } from "@langchain/langgraph/prebuilt";

// Define MCP server configurations
const mcpServers = {
  filesystem: {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "."]
  }
};

async function run() {
  // Initialize MCP servers and convert to LangChain tools
  const { tools, cleanup } = await convertMcpToLangchainTools(mcpServers);
  
  try {
    // Create a language model
    const llm = new ChatAnthropic({ 
      model: "claude-3-7-sonnet-latest",
      temperature: 0 
    });
    
    // Create a ReAct agent with the tools
    const agent = createReactAgent({
      llm,
      tools
    });
    
    // Use the agent to perform a task
    const result = await agent.invoke({
      input: "List all files in the current directory and tell me which ones are TypeScript files."
    });
    
    console.log("Agent response:", result);
  } finally {
    // Always clean up when done
    await cleanup();
  }
}

run().catch(error => {
  console.error("Error:", error);
  process.exit(1);
});
```

## Explanation

1. **Import Dependencies**: 
   - `convertMcpToLangchainTools` from our package
   - LangChain components for the agent and language model

2. **Define MCP Servers**: 
   - We use a simple configuration with just the filesystem server
   - The command and args specify how to start the server

3. **Initialize and Convert**:
   - `convertMcpToLangchainTools()` starts the servers and converts the tools
   - We get back `tools` and `cleanup` function

4. **Create Language Model and Agent**:
   - We create a Claude LLM instance
   - We create a ReAct agent with our tools

5. **Use the Agent**:
   - We invoke the agent with a task that will use the filesystem tools
   - The agent decides which tools to use and how to use them

6. **Cleanup**:
   - We call the `cleanup()` function in a `finally` block
   - This ensures resources are released even if an error occurs

## Full Project Example

For a complete working example, see [this repository](https://github.com/hideya/langchain-mcp-tools-ts-usage/blob/main/src/index.ts).

## Next Steps

- Try the [Multiple Servers Example](/examples/multiple-servers.md) to work with multiple MCP servers simultaneously
- Learn about [Remote Servers](/mcp-servers/remote.md) to connect to MCP servers running elsewhere
