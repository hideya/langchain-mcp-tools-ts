import "dotenv/config";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import WebSocket from 'ws';
import * as fs from "fs";

import {
  convertMcpToLangchainTools,
  McpServersConfig,
  McpServerCleanupFn,
  McpToolsLogger
} from "../src/langchain-mcp-tools";
import { LogLevel } from "../src/logger";
import { applyOpenAIIntegrationFix } from "../src/openai-integration-fix";

export async function testWithFix(): Promise<void> {
  // Apply the fix BEFORE initializing anything with OpenAI
  applyOpenAIIntegrationFix();
  
  let mcpCleanup: McpServerCleanupFn | undefined;
  const openedLogFiles: { [serverName: string]: number } = {};

  try {
    const mcpServers: McpServersConfig = {
      weather: {
        command: "npx",
        args: [
          "-y",
         "@h1deya/mcp-server-weather"
        ]
      },
    };

    // Set up logging
    Object.keys(mcpServers).forEach(serverName => {
      if (mcpServers[serverName].command) {
        const logPath = `mcp-server-${serverName}.log`;
        const logFd = fs.openSync(logPath, "w");
        mcpServers[serverName].stderr = logFd;
        openedLogFiles[logPath] = logFd;
      }
    });

    // Simple logger
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

    const { tools, cleanup } = await convertMcpToLangchainTools(
      mcpServers, { logger: new SimpleConsoleLogger() }
    );

    mcpCleanup = cleanup

    const llm = new ChatOpenAI({
      model: "gpt-4.1-nano"
    });

    const agent = createReactAgent({
      llm,
      tools
    });

    console.log("\x1b[32m");  // color to green
    console.log("\nLLM model:", llm.constructor.name, llm.model);
    console.log("Fix applied: Testing with JSON schemas");
    console.log("\x1b[0m");  // reset the color

    const query = "Are there any weather alerts in California?";

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

    // Close log files
    Object.keys(openedLogFiles).forEach(logPath => {
      try {
        fs.closeSync(openedLogFiles[logPath]);
      } catch (error) {
        console.error(`Error closing log file: ${logPath}:`, error);
      }
    });
  }
}

testWithFix().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
