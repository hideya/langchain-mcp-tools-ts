# Types Reference

This page documents the TypeScript types used in the LangChain MCP Tools package.

## McpServersConfig

The main configuration type for defining MCP servers.

```typescript
type McpServersConfig = {
  [serverName: string]: McpServerConfig;
};
```

## McpServerConfig

Configuration for a single MCP server. Can be either a local server (command-based) or a remote server (URL-based).

```typescript
type McpServerConfig = LocalMcpServerConfig | RemoteMcpServerConfig;
```

## LocalMcpServerConfig

Configuration for a local MCP server that will be spawned as a child process.

```typescript
interface LocalMcpServerConfig {
  command: string;
  args: string[];
  cwd?: string;
  stderr?: number;
}
```

<table class="parameter-table">
  <thead>
    <tr>
      <th>Property</th>
      <th>Type</th>
      <th>Required</th>
      <th>Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>command</td>
      <td>string</td>
      <td>Yes</td>
      <td>Command to run the MCP server (e.g., "npx", "node", "python")</td>
    </tr>
    <tr>
      <td>args</td>
      <td>string[]</td>
      <td>Yes</td>
      <td>Arguments to pass to the command</td>
    </tr>
    <tr>
      <td>cwd</td>
      <td>string</td>
      <td>No</td>
      <td>Working directory for the MCP server process</td>
    </tr>
    <tr>
      <td>stderr</td>
      <td>number</td>
      <td>No</td>
      <td>File descriptor for redirecting server stderr output</td>
    </tr>
  </tbody>
</table>

## RemoteMcpServerConfig

Configuration for connecting to a remote MCP server via URL.

```typescript
interface RemoteMcpServerConfig {
  url: string;
}
```

<table class="parameter-table">
  <thead>
    <tr>
      <th>Property</th>
      <th>Type</th>
      <th>Required</th>
      <th>Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>url</td>
      <td>string</td>
      <td>Yes</td>
      <td>URL of the remote MCP server (http/https for SSE, ws/wss for WebSocket)</td>
    </tr>
  </tbody>
</table>

## McpServerCleanupFn

Function type for the cleanup callback returned by `convertMcpToLangchainTools()`.

```typescript
type McpServerCleanupFn = () => Promise<void>;
```

This function should be called when you're done using the tools to properly close all MCP server sessions.

## Usage Examples

### Local MCP Server Configuration

```typescript
const mcpServers = {
  filesystem: {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
    cwd: "/path/to/working/dir"
  }
};
```

### Remote MCP Server Configuration

```typescript
const mcpServers = {
  "remote-fetch": {
    url: "http://localhost:8080/mcp-server-fetch"
  },
  "websocket-server": {
    url: "ws://localhost:8081/mcp-server"
  }
};
```

### Mixed Configuration

```typescript
const mcpServers = {
  filesystem: {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "."]
  },
  "remote-fetch": {
    url: "http://localhost:8080/mcp-server-fetch"
  }
};
```

### Redirecting stderr to a Log File

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
