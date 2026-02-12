import "dotenv/config";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage } from "@langchain/core/messages";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatCerebras } from "@langchain/cerebras";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatGroq } from "@langchain/groq";
import { ChatOpenAI } from "@langchain/openai";
import { ChatXAI } from "@langchain/xai";
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

      // Local MCP server that uses `uvx`
      // https://pypi.org/project/mcp-server-fetch/
      // This Fetch local server has schema issues with Google GenAI
      fetch: {
        command: "uvx",
        args: [
          "mcp-server-fetch==2025.4.7"
        ]
      },

      // Embedding the value of an environment variable
      // https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search
      "brave-search": {
        command: "npx",
        args: [ "-y", "@modelcontextprotocol/server-brave-search"],
        env: { "BRAVE_API_KEY": `${process.env.BRAVE_API_KEY}` }
      },

      // Example of remote MCP server authentication via Authorization header
      // https://github.com/github/github-mcp-server?tab=readme-ov-file#remote-github-mcp-server
      github: {
        // To avoid auto protocol fallback, specify the protocol explicitly when using authentication
        type: "http",  // or `transport: "http",`
        url: "https://api.githubcopilot.com/mcp/",
        headers: {
          "Authorization": `Bearer ${process.env.GITHUB_PERSONAL_ACCESS_TOKEN}`
        }
      },

      // For remote MCP servers that require OAuth, consider using "mcp-remote"
      notion: {
        command: "npx",
        args: ["-y", "mcp-remote", "https://mcp.notion.com/mcp"],
      },

      // This Airtable local server has schema issues with Google GenAI
      airtable: {
        command: "npx",
        "args": ["-y", "airtable-mcp-server@1.10.0"],
        env: {
          "AIRTABLE_API_KEY": `${process.env.AIRTABLE_API_KEY}`,
        }
      },
    };

    const queries = [
      "Read and briefly summarize the LICENSE file in the current directory",
      // "Fetch the raw HTML content from bbc.com and tell me the titile",
      // // NOTE: The following is to test tool call error handling
      // "Try to fetch the raw HTML content from abc.bbc.com, bbc.com and xyz.bbc.com, and tell me which is succesful",
      // "Search for 'news in California' and show the first hit",
      // "Tell me about my default GitHub profile",
      // "Tell me about my default Notion account",
    ]

    // // If you are interested in local MCP server's stderr redirection,
    // // uncomment the following code snippets.
    // //
    // // Set a file descriptor to which MCP server's stderr is redirected
    // Object.keys(mcpServers).forEach(serverName => {
    //   if (mcpServers[serverName].command) {
    //     const logPath = `mcp-server-${serverName}.log`;
    //     const logFd = fs.openSync(logPath, "w");
    //     mcpServers[serverName].stderr = logFd;
    //     openedLogFiles[logPath] = logFd;
    //   }
    // });

    // // A very simple custom logger example (optional)
    // class SimpleConsoleLogger implements McpToolsLogger {
    //   constructor(private readonly prefix: string = "MCP") {}
    //   private log(level: string, ...args: unknown[]) {
    //     console.log(`\x1b[90m${level}:\x1b[0m`, ...args);
    //   }
    //   public debug(...args: unknown[]) { this.log("DEBUG", ...args); }
    //   public info(...args: unknown[]) { this.log("INFO", ...args); }
    //   public warn(...args: unknown[]) { this.log("WARN", ...args); }
    //   public error(...args: unknown[]) { this.log("ERROR", ...args); }
    // }

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

    // const llm = new ChatGroq({
    //   // https://console.groq.com/docs/rate-limits
    //   // https://console.groq.com/dashboard/usage
    //   model: "openai/gpt-oss-20b"
    //   // model: "openai/gpt-oss-120b"
    // });

    // const llm = new ChatCerebras({
    //   // https://cloud.cerebras.ai
    //   // https://inference-docs.cerebras.ai/models/openai-oss
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

    for (const query of queries) {
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
    }
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
  }
}

test().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
