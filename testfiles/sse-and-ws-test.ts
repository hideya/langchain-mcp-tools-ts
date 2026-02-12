import "dotenv/config";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage } from "@langchain/core/messages";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import { ChatXAI } from "@langchain/xai";
import WebSocket from 'ws';
import * as fs from "fs";

import {
  convertMcpToLangchainTools,
  McpServersConfig,
  McpServerCleanupFn,
  McpToolsLogger,
  LlmProvider
} from "../src/langchain-mcp-tools";
// } from "@h1deya/langchain-mcp-tools";

import { startRemoteMcpServerLocally } from "./remote-server-utils";

export async function test(): Promise<void> {
  let mcpCleanup: McpServerCleanupFn | undefined;
  const openedLogFiles: { [serverName: string]: number } = {};

  // Run a SSE MCP server using Supergateway in a separate process
  const [sseServerProcess, sseServerPort] = await startRemoteMcpServerLocally(
    "SSE",  "npx -y @h1deya/mcp-server-weather");

  // Run a WS MCP server using Supergateway in a separate process
  // NOTE: without the following line, I got this error:
  //   ReferenceError: WebSocket is not defined
  //     at <anonymous> (.../node_modules/@modelcontextprotocol/sdk/src/client/websocket.ts:29:26)
  global.WebSocket = WebSocket as any;

  const [wsServerProcess, wsServerPort] = await startRemoteMcpServerLocally(
    "WS",  "npx -y @h1deya/mcp-server-weather");

  try {
    const mcpServers: McpServersConfig = {
      // // Run the weather MCP server locally for sanity check
      // "us-weather": {  // US weather only
      //   command: "npx",
      //   args: [
      //     "-y",
      //    "@h1deya/mcp-server-weather"
      //   ]
      // },

      // Auto-detection example
      // This will try Streamable HTTP first, then fallback to SSE
      "us-weather": {
        url: `http://localhost:${sseServerPort}/sse`
      },

      // "us-weather": {
      //   url: `http://localhost:${sseServerPort}/sse`,
      //   transport: "sse"  // Force SSE
      //   // type: "sse"  // This also works instead of the above
      // },

      // "us-weather": {
      //   url: `ws://localhost:${wsServerPort}/message`
      //   // optionally `transport: "ws"` or `type: "ws"`
      // },
    };

    // MCP server's stderr redirection
    // Set a file descriptor to which MCP server's stderr is redirected
    Object.keys(mcpServers).forEach(serverName => {
      if (mcpServers[serverName].command) {
        const logPath = `mcp-server-${serverName}.log`;
        const logFd = fs.openSync(logPath, "w");
        mcpServers[serverName].stderr = logFd;
        openedLogFiles[logPath] = logFd;
      }
    });

    // Uncomment one of the following and select the LLM to use

    const llm = new ChatOpenAI({
      // https://developers.openai.com/api/docs/pricing
      // https://platform.openai.com/settings/organization/billing/overview
      model: "gpt-5-mini"
      // model: "openai:gpt-5.2"
    });

    // const llm = new ChatAnthropic({
    //   // https://platform.claude.com/docs/en/about-claude/models/overview
    //   // https://console.anthropic.com/settings/billing
    //   model: "claude-3-5-haiku-latest"
    //   // model: "anthropic:claude-haiku-4-5"
    // });

    // const llm = new ChatGoogleGenerativeAI({
    //   // https://ai.google.dev/gemini-api/docs/pricing
    //   // https://console.cloud.google.com/billing
    //   model: "gemini-2.5-flash"
    //   // model: "gemini-3-flash-preview"
    // });

    // const llm = new ChatXAI({
    //   // https://docs.x.ai/developers/models
    //   model: "grok-3-mini"
    //   // model: "grok-4-1-fast-non-reasoning"
    // });

    let llmProvider: LlmProvider = "none";
    if (llm instanceof ChatAnthropic) {
      llmProvider = "anthropic";
    } else if (llm as object instanceof ChatOpenAI) {
      llmProvider = "openai";
    } else if (llm as object instanceof ChatGoogleGenerativeAI) {
      llmProvider = "google_genai";
    } else if (llm as object instanceof ChatXAI) {
      llmProvider = "xai";
    }

    const { tools, cleanup } = await convertMcpToLangchainTools(
      mcpServers, { llmProvider, logLevel: "debug" }
    );

    mcpCleanup = cleanup

    const agent = createReactAgent({
      llm,
      tools
    });

    console.log("\x1b[32m");  // color to green
    console.log("\nLLM model:", llm.constructor.name, llm.model);
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

    // the following only needed when testing the `stderr` key
    Object.keys(openedLogFiles).forEach(logPath => {
      try {
        fs.closeSync(openedLogFiles[logPath]);
      } catch (error) {
        console.error(`Error closing log file: ${logPath}:`, error);
      }
    });

    if (sseServerProcess) {
      sseServerProcess.kill();
    }
    if (wsServerProcess) {
      wsServerProcess.kill();
    }
  }
}

test().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
