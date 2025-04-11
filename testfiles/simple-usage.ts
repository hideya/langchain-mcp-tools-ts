import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage } from "@langchain/core/messages";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import dotenv from "dotenv";
import * as child_process from 'child_process';
import * as fs from "fs";
import * as net from 'net';
import WebSocket from 'ws';  // needed obly for WebSocket MCP test server

// Initialize environment variables
// Be sure to set ANTHROPIC_API_KEY and/or OPENAI_API_KEY as needed
dotenv.config();

import {
  convertMcpToLangchainTools,
  McpServersConfig,
  McpServerCleanupFn,
  McpToolsLogger
} from "../src/langchain-mcp-tools";
import { LogLevel } from "../src/logger";


export async function test(): Promise<void> {
  let mcpCleanup: McpServerCleanupFn | undefined;
  const openedLogFiles: { [serverName: string]: number } = {};

  // If you are interested in testing the SSE/WS server setup, comment out
  // one of the following code snippets and one of the appropriate "weather"
  // server configurations, while commenting out the one for the stdio server

  // const [sseServerProcess, sseServerPort] = await startMcpServer(
  //   "SSE",  "npx -y @h1deya/mcp-server-weather")

  // NOTE: without the following, I got this error:
  // ReferenceError: WebSocket is not defined
  //   at <anonymous> (.../node_modules/@modelcontextprotocol/sdk/src/client/websocket.ts:29:26)
  global.WebSocket = WebSocket as any;
  const [wsServerProcess, wsServerPort] = await startMcpServer(
    "WS",  "npx -y @h1deya/mcp-server-weather")

  try {
    const mcpServers: McpServersConfig = {
      filesystem: {
        command: "npx",
        args: [
          "-y",
          "@modelcontextprotocol/server-filesystem",
          "."  // path to a directory to allow access to
        ],
        cwd: "/tmp"  // the working directory to be use by the server
      },
      fetch: {
        command: "uvx",
        args: [
          "mcp-server-fetch"
        ]
      },
      // weather: {
      //   command: "npx",
      //   args: [
      //     "-y",
      //    "@h1deya/mcp-server-weather"
      //   ]
      // },
      // weather: {
      //   url: `http://localhost:${sseServerPort}/sse`
      // },
      weather: {
        url: `ws://localhost:${wsServerPort}/message`
      },

      // sqlite: {
      //   command: "uvx",
      //   args: [
      //     "mcp-server-sqlite",
      //     "--db-path",
      //     "mcp-server-sqlite-test.sqlite3"
      //   ],
      //   cwd: "/tmp"  // the working directory to be use by the server
      // },
      // "sequential-thinking": {
      //   command: "npx",
      //   args: [
      //     "-y",
      //     "@modelcontextprotocol/server-sequential-thinking"
      //   ]
      // },
      // playwright: {
      //   command: "npx",
      //   args: [
      //     "@playwright/mcp@latest"
      //   ]
      // },
    };

    // If you are interested in MCP server's stderr redirection,
    // comment out the following code snippets.

    // Set a file descriptor to which MCP server's stderr is redirected
    Object.keys(mcpServers).forEach(serverName => {
      if (mcpServers[serverName].command) {
        const logPath = `mcp-server-${serverName}.log`;
        const logFd = fs.openSync(logPath, "w");
        mcpServers[serverName].stderr = logFd;
        openedLogFiles[logPath] = logFd;
      }
    });

    // A very simple custom logger example (optional)
    class SimpleConsoleLogger implements McpToolsLogger {
      constructor(private readonly prefix: string = "MCP") {}

      private log(level: string, ...args: unknown[]) {
        console.log(`\x1b[90m${level}:\x1b[0m`, ...args);
      }

      public debug(...args: unknown[]) { this.log("DEBUG", ...args); }
      public info(...args: unknown[]) { this.log("INFO", ...args); }
      public warn(...args: unknown[]) { this.log("WARN", ...args); }
      public error(...args: unknown[]) { this.log("ERROR", ...args); }
    }

    // const { tools, cleanup } = await convertMcpToLangchainTools(mcpServers);
    // const { tools, cleanup } = await convertMcpToLangchainTools(mcpServers, { logLevel: "debug" });
    const { tools, cleanup } = await convertMcpToLangchainTools(
      mcpServers, { logger: new SimpleConsoleLogger() }
    );

    mcpCleanup = cleanup

    // const llm = new ChatAnthropic({
    //   model: "claude-3-7-sonnet-latest"
    // });
    const llm = new ChatOpenAI({
      model: "o3-mini"
    });

    const agent = createReactAgent({
      llm,
      tools
    });

    // const query = "Read the news headlines on bbc.com";
    // const query = "Read and briefly summarize the LICENSE file";
    // const query = "Tell me the number of directories in the current directory";
    const query = "Tomorrow's weather in SF?";
    // const query = "Make a DB and put items fruits, apple and orange, with counts 123 and 345 respectively";
    // const query = "Put items fruits, apple and orange, with counts 123 and 456 respectively to the DB, " +
    //   "increment the coutns by 1, and show all the items in the DB."
    // const query = "Use sequential thinking to arrange these events of backing bread " +
    //   "in the correct sequence: baking, proofing, mixing, kneading, cooling"

    console.log("\x1b[33m");  // color to yellow
    console.log(query);
    console.log("\x1b[0m");  // reset the color

    const messages =  { messages: [new HumanMessage(query)] }

    const result = await agent.invoke(messages);

    // the last message should be an AIMessage
    const response = result.messages[result.messages.length - 1].content;

    console.log("\x1b[36m");  // color to cyan
    console.log(response);
    console.log("\x1b[0m");  // reset the color

  } finally {
    await mcpCleanup?.();

    // the following only needed when testing the `stderr` key
    Object.keys(openedLogFiles).forEach(logPath => {
      try {
        fs.closeSync(openedLogFiles[logPath]);
      } catch (error) {
        console.error(`Error closing log file: ${logPath}:`, error);
      }
    });
    // the followings only needed when testing the `url` key
    if (typeof sseServerProcess !== 'undefined') {
      sseServerProcess.kill();
    }
    if (typeof wsServerProcess !== 'undefined') {
      wsServerProcess.kill();
    }
  }
}


// The following only needed when testing SSE/WS MCP server connection
/**
 * Start an MCP server process via supergateway with the specified transport
 * type.  Supergateway runs MCP stdio-based servers over SSE or WebSockets
 * and is used here to run local SSE/WS servers for connection testing.
 * Ref: https://github.com/supercorp-ai/supergateway
 *
 * @param transportType - The transport type, either 'sse' or 'ws'
 * @param mcpServerRunCommand - The command to run the MCP server
 * @param waitTime - Time to wait for the server to start listening on its port
 * @returns A Promise resolving to [serverProcess, serverPort]
 */
async function startMcpServer(
  transportType: string,
  mcpServerRunCommand: string,
  waitTime: number = 2
): Promise<[child_process.ChildProcess, number]> {
  
  /**
   * Find and return a free port on localhost.
   */
  async function findFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.unref();
      server.on('error', reject);
      server.listen(0, () => {
        const port = (server.address() as net.AddressInfo).port;
        server.close(() => {
          resolve(port);
        });
      });
    });
  }

  const serverPort = await findFreePort();

  // Base command common to both server types
  const command = [
    "npx",
    "-y",
    "supergateway",
    "--stdio",
    mcpServerRunCommand,
    "--port", serverPort.toString(),
  ];

  // Add transport-specific arguments
  if (transportType.toLowerCase() === 'sse') {
    command.push(
      "--baseUrl", `http://localhost:${serverPort}`,
      "--ssePath", "/sse",
      "--messagePath", "/message"
    );
  } else if (transportType.toLowerCase() === 'ws') {
    command.push(
      "--outputTransport", "ws",
      "--messagePath", "/message"
    );
  } else {
    throw new Error(`Unsupported transport type: ${transportType}`);
  }

  // Start the server process
  const serverProcess = child_process.spawn(
    command[0],
    command.slice(1),
    {
      stdio: ['inherit', 'inherit', 'inherit'],
    }
  );

  console.log(`Started ${transportType.toUpperCase()} MCP Server Process with PID: ${serverProcess.pid}`);
  
  // Wait until the server starts listening on the port
  await new Promise(resolve => setTimeout(resolve, waitTime * 1000));

  return [serverProcess, serverPort];
}


test().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
