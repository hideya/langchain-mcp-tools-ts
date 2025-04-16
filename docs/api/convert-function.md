# convertMcpToLangchainTools()

<div class="api-method">

## Overview

The `convertMcpToLangchainTools()` function is the core utility of this package. It handles parallel initialization of specified MCP servers and converts their available tools into an array of LangChain-compatible tools.

## Signature

```typescript
async function convertMcpToLangchainTools(
  mcpServers: McpServersConfig
): Promise<{
  tools: StructuredTool[];
  cleanup: McpServerCleanupFn;
}>
```

## Parameters

<table class="parameter-table">
  <thead>
    <tr>
      <th>Parameter</th>
      <th>Type</th>
      <th>Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>mcpServers</td>
      <td>McpServersConfig</td>
      <td>
        Configuration object for MCP servers. Each key is a server name and the value contains
        the command and arguments to start the server. For remote servers, it contains the URL.
      </td>
    </tr>
  </tbody>
</table>

## Return Value

The function returns a Promise that resolves to an object containing:

<table class="parameter-table">
  <thead>
    <tr>
      <th>Property</th>
      <th>Type</th>
      <th>Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>tools</td>
      <td>StructuredTool[]</td>
      <td>
        An array of LangChain StructuredTool objects that can be used with LangChain agents.
        Each tool corresponds to a function provided by the MCP servers.
      </td>
    </tr>
    <tr>
      <td>cleanup</td>
      <td>McpServerCleanupFn</td>
      <td>
        An async function that should be called when you're done using the tools to properly close
        all MCP server sessions and free resources.
      </td>
    </tr>
  </tbody>
</table>

## Usage Example

```typescript
import { convertMcpToLangchainTools } from '@h1deya/langchain-mcp-tools';

// Define MCP server configurations
const mcpServers = {
  filesystem: {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "."]
  },
  fetch: {
    command: "uvx",
    args: ["mcp-server-fetch"]
  }
};

// Use the function
async function example() {
  try {
    const { tools, cleanup } = await convertMcpToLangchainTools(mcpServers);
    
    console.log(`Loaded ${tools.length} tools`);
    
    // Use the tools with LangChain...
    
    // Clean up when done
    await cleanup();
  } catch (error) {
    console.error('Error:', error);
  }
}
```

## Error Handling

The function may throw errors in the following cases:
- MCP server fails to start
- Communication with an MCP server fails
- Invalid server configuration

It's recommended to wrap calls to this function in a try/catch block as shown in the example.

## Important Notes

1. Always call the `cleanup` function when you're done with the tools to prevent resource leaks
2. The function initializes all specified servers in parallel for better performance
3. Only text results from tool calls are currently supported

</div>
