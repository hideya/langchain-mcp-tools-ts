import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { HumanMessage } from '@langchain/core/messages';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import dotenv from 'dotenv';

// Initialize environment variables
dotenv.config();

import {
  convertMcpToLangchainTools,
  McpServersConfig,
  McpServerCleanupFn,
  McpToolsLogger
} from '../src/langchain-mcp-tools';
import { LogLevel } from '../src/logger';

export async function test(): Promise<void> {
  let mcpCleanup: McpServerCleanupFn | undefined;

  try {
    const mcpServers: McpServersConfig = {
      filesystem: {
        command: 'npx',
        args: [
          '-y',
          '@modelcontextprotocol/server-filesystem',
          '.'  // path to a directory to allow access to
        ]
      },
      fetch: {
        command: 'uvx',
        args: [
          'mcp-server-fetch'
        ]
      },
      weather: {
        command: 'npx',
        args: [
          '-y',
         '@h1deya/mcp-server-weather'
        ]
      },
    };

    // A very simple custom logger example (optional)
    class SimpleConsoleLogger implements McpToolsLogger {
      constructor(private readonly prefix: string = 'MCP') {}

      private createLogMethod(level: string) {
        return (...args: unknown[]) => console.log(`\x1b[90m${level}:\x1b[0m`, ...args);
      }

      debug = this.createLogMethod('DEBUG');
      info = this.createLogMethod('INFO');
      warn = this.createLogMethod('WARN');
      error = this.createLogMethod('ERROR');
    }

    // const { tools, cleanup } = await convertMcpToLangchainTools(mcpServers);
    // const { tools, cleanup } = await convertMcpToLangchainTools(mcpServers, { logLevel: 'debug' });
    const { tools, cleanup } = await convertMcpToLangchainTools(
      mcpServers, { logger: new SimpleConsoleLogger() }
    );

    mcpCleanup = cleanup

    // const llm = new ChatAnthropic({
    //   model: 'claude-3-7-sonnet-latest'
    // });
    const llm = new ChatOpenAI({
      model: 'o3-mini'
    });

    const agent = createReactAgent({
      llm,
      tools
    });

    // const query = 'Read the news headlines on bbc.com';
    // const query = 'Read and briefly summarize the LICENSE file';
    const query = "Tomorrow's weather in SF?"

    console.log('\x1b[33m');  // color to yellow
    console.log(query);
    console.log('\x1b[0m');  // reset the color

    const messages =  { messages: [new HumanMessage(query)] }

    const result = await agent.invoke(messages);

    // the last message should be an AIMessage
    const response = result.messages[result.messages.length - 1].content;

    console.log('\x1b[36m');  // color to cyan
    console.log(response);
    console.log('\x1b[0m');  // reset the color

  } finally {
    await mcpCleanup?.();
  }
}

test().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
