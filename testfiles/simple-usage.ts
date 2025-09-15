import "dotenv/config";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage } from "@langchain/core/messages";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatCerebras } from "@langchain/cerebras";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatGroq } from "@langchain/groq";
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

import { startRemoteMcpServerLocally } from "./remote-server-utils";

export async function test(): Promise<void> {
  let mcpCleanup: McpServerCleanupFn | undefined;
  const openedLogFiles: { [serverName: string]: number } = {};

  // If you are interested in testing the SSE/WS server setup, uncomment
  // one of the following code snippets and one of the appropriate "weather"
  // server configurations, while commenting out the others.

  // const [sseServerProcess, sseServerPort] = await startRemoteMcpServerLocally(
  //   "SSE",  "npx -y @h1deya/mcp-server-weather");

  // // NOTE: without the following line, I got this error:
  // //   ReferenceError: WebSocket is not defined
  // //     at <anonymous> (.../node_modules/@modelcontextprotocol/sdk/src/client/websocket.ts:29:26)
  // global.WebSocket = WebSocket as any;
  //
  // const [wsServerProcess, wsServerPort] = await startRemoteMcpServerLocally(
  //   "WS",  "npx -y @h1deya/mcp-server-weather");

  try {
    const mcpServers: McpServersConfig = {
      filesystem: {
        // transport: "stdio",  // optional
        // type: "stdio",  // optional: VSCode-style config works too
        command: "npx",
        args: [
          "-y",
          "@modelcontextprotocol/server-filesystem",
          "."  // path to a directory to allow access to
        ],
        // cwd: "/tmp"  // the working directory to be use by the server
      },

      fetch: {
        command: "uvx",
        args: [
          "mcp-server-fetch"
        ]
      },

      "us-weather": {  // US weather only
        command: "npx",
        args: [
          "-y",
         "@h1deya/mcp-server-weather"
        ]
      },
      
      // // Auto-detection example: This will try Streamable HTTP first, then fallback to SSE
      // "us-weather": {
      //   url: `http://localhost:${sseServerPort}/sse`
      // },
      
      // // THIS DOESN'T WORK: Example of explicit transport selection:
      // "us-weather": {
      //   url: `http://localhost:${streamableHttpServerPort}/mcp`,
      //   transport: "streamable_http"  // Force Streamable HTTP
      //   // type: "http"  // VSCode-style config also works instead of the above
      // },
      
      // "us-weather": {
      //   url: `http://localhost:${sseServerPort}/sse`,
      //   transport: "sse"  // Force SSE
      //   // type: "sse"  // This also works instead of the above
      // },

      // "us-weather": {
      //   url: `ws://localhost:${wsServerPort}/message`
      //   // optionally `transport: "ws"` or `type: "ws"`
      // },

      // // https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search
      // "brave-search": {
      //     "command": "npx",
      //     "args": [ "-y", "@modelcontextprotocol/server-brave-search"],
      //     "env": { "BRAVE_API_KEY": `${process.env.BRAVE_API_KEY}` }
      // },

      // // Example of authentication via Authorization header
      // // https://github.com/github/github-mcp-server?tab=readme-ov-file#remote-github-mcp-server
      // github: {
      //   // To avoid auto protocol fallback, specify the protocol explicitly when using authentication
      //   type: "http",  // or `transport: "http",`
      //   url: "https://api.githubcopilot.com/mcp/",
      //   headers: {
      //     "Authorization": `Bearer ${process.env.GITHUB_PERSONAL_ACCESS_TOKEN}`
      //   }
      // },

      // // NOTE: comment out "fetch" when you use "notion".
      // // They both have a tool named "fetch," which causes a conflict.
      //
      // // Run Notion remote MCP server via mcp-remote
      // notion: {
      //     "command": "npx",  // OAuth via "mcp-remote"
      //     "args": ["-y", "mcp-remote", "https://mcp.notion.com/mcp"],
      // },
      //
      // // The following Notion local MCP server is not recommended anymore?
      // // Refs:
      // // - https://developers.notion.com/docs/get-started-with-mcp
      // // - https://www.npmjs.com/package/@notionhq/notion-mcp-server
      // notion: {
      //   "command": "npx",
      //   "args": ["-y", "@notionhq/notion-mcp-server"],
      //   "env": {
      //     "NOTION_TOKEN": `${process.env.NOTION_INTEGRATION_SECRET}`
      //   }
      // },

      // airtable: {
      //   command: "npx",
      //   "args": ["-y", "airtable-mcp-server"],
      //   env: {
      //     "AIRTABLE_API_KEY": `${process.env.AIRTABLE_API_KEY}`,
      //   }
      // },

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
    // uncomment the following code snippets.
    //
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

    // Uncomment one of the following and select the LLM to use

    // const llm = new ChatAnthropic({
    //   // https://docs.anthropic.com/en/docs/about-claude/pricing
    //   // https://console.anthropic.com/settings/billing
    //   model: "claude-3-5-haiku-latest"
    //   // model: "claude-sonnet-4-0"
    // });

    // const llm = new ChatOpenAI({
    //   // https://platform.openai.com/docs/pricing
    //   // https://platform.openai.com/settings/organization/billing/overview
    //   // model: "gpt-4.1-nano"
    //   model: "gpt-5-mini"
    // });

    const llm = new ChatGoogleGenerativeAI({
      // https://ai.google.dev/gemini-api/docs/pricing
      // https://console.cloud.google.com/billing
      model: "gemini-2.5-flash"
      // model: "gemini-2.5-pro"
      // model: "gemini-1.5-flash"
      // model: "gemini-1.5-pro"  // need pro for notion
    });

    // const llm = new ChatXAI({
    //   // https://console.x.ai
    //   model: "grok-3-mini"
    //   // model: "grok-4"
    // });

    // const llm = new ChatGroq({
    //   // https://console.groq.com/docs/rate-limits
    //   // https://console.groq.com/dashboard/usage
    //   model: "openai/gpt-oss-20b"
    //   // model: "openai/gpt-oss-120b"
    // });

    // const llm = new ChatCerebras({
    //   // https://inference-docs.cerebras.ai/models/openai-oss
    //   // https://cloud.cerebras.ai
    //   model: "gpt-oss-120b"
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
      mcpServers, { llmProvider }
      // mcpServers, { llmProvider, logLevel: "debug" }  // Usage example of logLevel
      // mcpServers, { llmProvider, logger: new SimpleConsoleLogger() }  // Usage example of a custom logger
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
    // const query = "Tell me how LLMs work in a few sentences";
    // const query = "Read the news headlines on bbc.com";
    // const query = "Read and briefly summarize the LICENSE file";
    // const query = "Tell me how many directories there are in `.`";
    // const query = "Tell me about my GitHub profile";
    // const query = "Make a new table in DB and put items apple and orange with counts 123 and 345 respectively, " +
    //               "then increment the coutns by 1, and show all the items in the table.";
    // const query = "Use sequential-thinking and plan a trip from Tokyo to San Francisco";
    // const query = "Open the BBC.com page, then close it";
    // const query = "Tell me about my Notion account";
    // const query = "Tell me about my Airtable account";
    // const query = "What's the news from Tokyo today?";

    console.log("\x1b[33m");  // color to yellow
    console.log(query);
    console.log("\x1b[0m");  // reset the color

    const messages =  { messages: [new HumanMessage(query)] };

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

    // the following only needed when testing the `url` key
    if (typeof sseServerProcess !== 'undefined') {
      sseServerProcess.kill();
    }
    if (typeof wsServerProcess !== 'undefined') {
      wsServerProcess.kill();
    }
  }
}

test().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
