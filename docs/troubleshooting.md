# Troubleshooting

This guide addresses common issues you might encounter when using the LangChain MCP Tools package.

## MCP Server Connection Issues

### Problem: MCP Server Fails to Start

**Symptoms:**
- Error message: "Failed to start MCP server"
- Error message: "Cannot spawn process"

**Possible Causes and Solutions:**

1. **Command not found**
   
   The MCP server command is not installed or not in your PATH.
   
   ```
   Error: spawn npx ENOENT
   ```
   
   **Solution:** Install the required command.
   ```bash
   npm install -g npx
   ```

2. **Incorrect arguments**
   
   The arguments passed to the MCP server are incorrect.
   
   **Solution:** Verify the arguments in your configuration.
   ```typescript
   // Correct example
   filesystem: {
     command: "npx",
     args: ["-y", "@modelcontextprotocol/server-filesystem", "."]
   }
   ```

3. **Permission issues**
   
   The process doesn't have permission to execute the command.
   
   **Solution:** Ensure you have the correct permissions or run with elevated privileges if necessary.

### Problem: Connection Timeout

**Symptoms:**
- Error message: "Timeout waiting for MCP server to initialize"

**Possible Causes and Solutions:**

1. **Server is slow to start**
   
   **Solution:** If it's a heavy server, you may need to increase the timeout.
   Contact the package maintainer if this is a consistent issue.

2. **Server is crashing silently**
   
   **Solution:** Add stderr redirection to see error logs:
   ```typescript
   import * as fs from 'fs';
   
   const logFd = fs.openSync("mcp-server.log", "w");
   const mcpServers = {
     filesystem: {
       command: "npx",
       args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
       stderr: logFd
     }
   };
   ```

## Tool Conversion Issues

### Problem: Tool Fails to Convert

**Symptoms:**
- Some tools are missing from the returned array
- Error message: "Failed to convert MCP tool"

**Possible Causes and Solutions:**

1. **Incompatible tool format**
   
   The MCP server is returning tools in an unexpected format.
   
   **Solution:** Ensure you're using a compatible version of the MCP server. Check for updates to the LangChain MCP Tools package.

2. **Missing type definitions**
   
   **Solution:** Log the raw tool definition to debug:
   ```typescript
   const { tools, cleanup } = await convertMcpToLangchainTools(mcpServers);
   console.log(JSON.stringify(tools, null, 2));
   ```

## LangChain Integration Issues

### Problem: Agent Can't Use the Tools

**Symptoms:**
- Agent doesn't use the tools even when appropriate
- Error message: "Tool not found"

**Possible Causes and Solutions:**

1. **Tool names conflict**
   
   Multiple tools with the same name.
   
   **Solution:** Use unique server names in your config to ensure unique tool names.

2. **Incorrect tool usage by the agent**
   
   The agent is not properly using the tool format.
   
   **Solution:** Ensure you're using a compatible version of LangChain and an appropriate agent. ReAct agents typically work best with these tools.

3. **Input/output format mismatch**
   
   **Solution:** Check the tool schemas and agent prompt format. Debug by logging:
   ```typescript
   console.log(tools.map(tool => ({
     name: tool.name,
     description: tool.description,
     schema: tool.schema
   })));
   ```

## Remote Server Issues

### Problem: Can't Connect to Remote Server

**Symptoms:**
- Error message: "Failed to connect to remote MCP server"
- Error message: "Connection refused"

**Possible Causes and Solutions:**

1. **Server not running**
   
   **Solution:** Ensure the remote server is running and accessible.

2. **URL format incorrect**
   
   **Solution:** Check the URL format. For SSE servers, use `http://` or `https://`. For WebSocket servers, use `ws://` or `wss://`.

3. **CORS issues**
   
   **Solution:** Ensure the remote server allows CORS if running in a browser context.

## Resource Management Issues

### Problem: Memory Leaks

**Symptoms:**
- Application memory usage increases over time
- Server processes remain after application exits

**Possible Causes and Solutions:**

1. **Cleanup function not called**
   
   **Solution:** Always call the cleanup function when done:
   ```typescript
   const { tools, cleanup } = await convertMcpToLangchainTools(mcpServers);
   try {
     // Use tools...
   } finally {
     await cleanup();
   }
   ```

2. **Error during cleanup**
   
   **Solution:** Log any cleanup errors:
   ```typescript
   try {
     await cleanup();
   } catch (error) {
     console.error("Cleanup error:", error);
   }
   ```

## General Debugging Tips

1. **Enable verbose logging**
   
   ```typescript
   import { convertMcpToLangchainTools } from '@h1deya/langchain-mcp-tools';
   
   const { tools, cleanup } = await convertMcpToLangchainTools(mcpServers, {
     logger: console // Use a custom logger if available
   });
   ```

2. **Redirect stderr to file**
   
   ```typescript
   import * as fs from 'fs';
   
   const serverName = "filesystem";
   const logPath = `mcp-server-${serverName}.log`;
   const logFd = fs.openSync(logPath, "w");
   
   const mcpServers = {
     [serverName]: {
       command: "npx",
       args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
       stderr: logFd
     }
   };
   ```

3. **Test one server at a time**
   
   Isolate issues by testing with only one MCP server at a time.

4. **Check for version compatibility**
   
   Ensure you're using compatible versions of LangChain, the MCP SDK, and the MCP servers.

## Getting Help

If you continue to experience issues after trying these troubleshooting steps:

1. Check the [GitHub repository](https://github.com/hideya/langchain-mcp-tools-ts) for open issues
2. Open a new issue with detailed information about your problem
3. Provide relevant logs and code samples
