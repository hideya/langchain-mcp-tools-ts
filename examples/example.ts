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
  McpServerCleanupFn
} from '../src/langchain-mcp-tools';

export async function test(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY environment variable needs to be set');
  }
  // if (!process.env.OPENAI_API_KEY) {
  //   throw new Error('OPENAI_API_KEY environment variable needs to be set');
  // }

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

    const { tools, cleanup } = await convertMcpToLangchainTools(mcpServers);
    mcpCleanup = cleanup

    const llm = new ChatAnthropic({
      model: 'claude-3-5-sonnet-latest', temperature: 0, maxTokens: 1000
    });
    // const llm = new ChatOpenAI({
    //   model: 'gpt-4o', temperature: 0, maxTokens: 1000
    // });

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
