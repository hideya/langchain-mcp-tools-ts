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
import { makeToolsOpenAICompatible, checkToolCompatibility } from "../src/openai-compatibility-helpers";

export async function testWithCompatibilityHelper(): Promise<void> {
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

    console.log("🔄 Converting MCP servers to LangChain tools...");
    const { tools: originalTools, cleanup } = await convertMcpToLangchainTools(
      mcpServers, { logger: new SimpleConsoleLogger() }
    );

    mcpCleanup = cleanup;

    console.log(`\\n📊 Checking tool compatibility:`);
    const compatibility = checkToolCompatibility(originalTools);
    console.log(`✅ Compatible tools: ${compatibility.compatible}`);
    console.log(`❌ Incompatible tools: ${compatibility.incompatible}`);
    
    compatibility.details.forEach(detail => {
      const icon = detail.compatible ? "✅" : "❌";
      console.log(`  ${icon} ${detail.name} (${detail.schemaType} schema)`);
    });

    console.log("\\n🔧 Converting tools to OpenAI-compatible format...");
    const compatibleTools = makeToolsOpenAICompatible(originalTools);
    
    console.log("\\n📊 Checking converted tools:");
    const newCompatibility = checkToolCompatibility(compatibleTools);
    console.log(`✅ Compatible tools: ${newCompatibility.compatible}`);
    console.log(`❌ Incompatible tools: ${newCompatibility.incompatible}`);

    const llm = new ChatOpenAI({
      model: "gpt-4.1-nano"
    });

    console.log("\\n🚀 Creating React agent with compatible tools...");
    const agent = createReactAgent({
      llm,
      tools: compatibleTools  // Use the converted tools
    });

    console.log("\\x1b[32m");  // color to green
    console.log("\\nLLM model:", llm.constructor.name, llm.model);
    console.log("Using compatibility helper approach");
    console.log("\\x1b[0m");  // reset the color

    const query = "Are there any weather alerts in California?";

    console.log("\\x1b[33m");  // color to yellow
    console.log(query);
    console.log("\\x1b[0m");  // reset the color

    console.log("\\n💬 Testing agent invocation...");
    const messages = { messages: [new HumanMessage(query)] };

    const result = await agent.invoke(messages);

    // the last message should be an AIMessage
    const response = result.messages[result.messages.length - 1].content;

    console.log("\\x1b[36m");  // color to cyan
    console.log("✅ SUCCESS! Agent invocation completed without errors");
    console.log("📝 Response:", response);
    console.log("\\x1b[0m");  // reset the color

  } catch (error) {
    console.error("\\n❌ Test failed:", error);
    throw error;
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

testWithCompatibilityHelper().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
