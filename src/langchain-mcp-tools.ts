import { IOType } from "node:child_process";
import { Stream } from "node:stream";
import { DynamicStructuredTool, StructuredTool, ToolSchemaBase } from "@langchain/core/tools";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPReconnectionOptions } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { WebSocketClientTransport } from "@modelcontextprotocol/sdk/client/websocket.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { CallToolResultSchema, ListToolsResultSchema, Tool } from "@modelcontextprotocol/sdk/types.js";
import { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import { jsonSchemaToZod, JsonSchema } from "@h1deya/json-schema-to-zod";

import { JsonSchemaDraft7 } from "./schema-adapter-types.js";
import { makeJsonSchemaGeminiCompatible } from "./schema-adapter-gemini.js";
import { makeJsonSchemaOpenAICompatible } from "./schema-adapter-openai.js";
import { Logger } from "./logger.js";
import { createHttpTransportWithFallback } from "./transport-utils.js";

/**
 * Configuration for a command-line based MCP server.
 * This is used for local MCP servers that are spawned as child processes.
 *
 * @remarks
 * The `transport` and `type` fields are optional for command-based configs.
 * They can be useful for explicitly specifying "stdio" transport or for
 * compatibility with VSCode-style configurations.
 *
 * @public
 */
export interface CommandBasedConfig {
  url?: never;
  transport?: string;
  type?: string;
  headers?: never;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  stderr?: IOType | Stream | number;
  cwd?: string;
}

/**
 * Configuration for a URL-based MCP server.
 * This is used for remote MCP servers that are accessed via HTTP/HTTPS (SSE) or WebSocket.
 *
 * @remarks
 * The `headers` field provides a simple way to add authorization headers.
 * However, it will be overridden if transport-specific options (streamableHTTPOptions or sseOptions)
 * specify their own headers in requestInit.
 *
 * @public
 */
export interface UrlBasedConfig {
  url: string;
  transport?: string;  // Explicit transport selection
  type?: string;       // VSCode-style config compatibility
  headers?: Record<string, string>;
  command?: never;
  args?: never;
  env?: never;
  stderr?: never;
  cwd?: never;

  // Streamable HTTP specific options
  streamableHTTPOptions?: {
    authProvider?: OAuthClientProvider;
    requestInit?: RequestInit;
    reconnectionOptions?: StreamableHTTPReconnectionOptions;
    sessionId?: string;
  };

  // SSE client transport options
  sseOptions?: {
    // An OAuth client provider to use for authentication
    authProvider?: OAuthClientProvider;
    // Customizes the initial SSE request to the server
    eventSourceInit?: EventSourceInit;
    // Customizes recurring POST requests to the server
    requestInit?: RequestInit;
  };
}

/**
 * Configuration for an MCP server.
 * Can be either a command-line based server or a URL-based server.
 *
 * @public
 */
export type SingleMcpServerConfig = CommandBasedConfig | UrlBasedConfig;

/**
 * A registry mapping server names to their respective configurations.
 * This is used as the main parameter to convertMcpToLangchainTools().
 *
 * @example
 * const serverRegistry: McpServersConfig = {
 *   "filesystem": { command: "npx", args: ["@modelcontextprotocol/server-filesystem", "."] },
 *   "fetch": { command: "uvx", args: ["mcp-server-fetch"] }
 * };
 *
 * @public
 */
export interface McpServersConfig {
  [key: string]: SingleMcpServerConfig;
}

/**
 * Logger interface for MCP tools operations.
 * Provides structured logging capabilities for debugging and monitoring
 * MCP server connections and tool executions.
 *
 * @public
 */
export interface McpToolsLogger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

/**
 * Options for configuring logging behavior.
 * Controls the verbosity level of logging output during MCP operations.
 *
 * @public
 */
export interface LogOptions {
  /** Log verbosity level. Higher levels include all lower levels (e.g., "debug" includes "info", "warn", "error", "fatal") */
  logLevel?: "fatal" | "error" | "warn" | "info" | "debug" | "trace";
}

/**
 * Supported LLM providers for schema transformations.
 * Each provider has specific JSON schema requirements that may conflict with MCP tool schemas.
 *
 * @public
 */
export type LlmProvider = "openai" | "google_gemini" | "google_genai" | "anthropic" | "none";

/**
 * Configuration options for converting MCP servers to LangChain tools.
 * Extends LogOptions to include provider-specific schema transformations and custom logging.
 *
 * @public
 */
export interface ConvertMcpToLangchainOptions extends LogOptions {
  /** Custom logger implementation. If not provided, uses default Logger with specified logLevel */
  logger?: McpToolsLogger;
  /** LLM provider for schema compatibility transformations. Performs provider-specific JSON schema modifications to prevent compatibility issues */
  llmProvider?: LlmProvider;
}

/**
 * Cleanup function returned by convertMcpToLangchainTools.
 * Properly terminates all MCP server connections and cleans up resources.
 *
 * @public
 */
export interface McpServerCleanupFn {
  (): Promise<void>;
}

/**
 * Error interface for MCP-related errors.
 * Extends the standard Error interface with MCP-specific properties.
 *
 * @public
 */
export interface McpError extends Error {
  serverName: string;
  details?: unknown;
}

// Custom error type for MCP server initialization failures
/**
 * Error thrown when an MCP server initialization fails.
 * Contains details about the server that failed to initialize.
 *
 * @public
 */
export class McpInitializationError extends Error implements McpError {
  constructor(
    public serverName: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "McpInitializationError";
  }
}

/**
 * Applies LLM provider-specific schema transformations to ensure compatibility.
 * Different LLM providers have incompatible JSON Schema requirements for function calling.
 *
 * @param schema - Original tool input schema from MCP server
 * @param llmProvider - Target LLM provider for compatibility transformations
 * @param serverName - Server name for logging context
 * @param toolName - Tool name for logging context
 * @param logger - Logger instance for recording transformations
 * @returns Transformed schema compatible with the specified LLM provider
 *
 * @internal
 */
function processSchemaForLlmProvider(
  schema: ToolSchemaBase,
  llmProvider: LlmProvider,
  serverName: string,
  toolName: string,
  logger: McpToolsLogger
): ToolSchemaBase {
  let processedSchema: ToolSchemaBase = schema;

  if (llmProvider === "openai") {
    // OpenAI requires optional fields to be nullable (.optional() + .nullable())
    // Transform schema to meet OpenAI's requirements
    const result = makeJsonSchemaOpenAICompatible(processedSchema as JsonSchemaDraft7);
    if (result.wasTransformed) {
      logger.info(`MCP server "${serverName}/${toolName}"`,
        "Schema transformed for OpenAI: ", result.changesSummary);
    }
    processedSchema = result.schema;

    // Although the following issue was marked as completed, somehow
    // I am still experiencing the same difficulties as of July 2, 2025...
    //   https://github.com/langchain-ai/langchainjs/issues/6623
    // The following is a workaround to avoid the error
    processedSchema = jsonSchemaToZod(processedSchema as JsonSchema);

  } else if (llmProvider === "google_gemini" || llmProvider === "google_genai") {
    // Google Gemini API rejects nullable fields and requires strict OpenAPI 3.0 subset compliance
    // Transform schema to meet Gemini's strict requirements
    const result = makeJsonSchemaGeminiCompatible(processedSchema as JsonSchemaDraft7);
    if (result.wasTransformed) {
      logger.info(`MCP server "${serverName}/${toolName}"`,
        "Schema transformed for Gemini: ", result.changesSummary);
    }
    processedSchema = result.schema;

  } else if (llmProvider === "anthropic") {
    // Anthropic Claude has very relaxed schema requirements with no documented restrictions
    // No schema modifications needed
    // Claude is tested to work fine with passing the JSON schema directly

  } else {
    // Take a conservative approach and use the Zod-converted schema
    // It's an old way, but well exercised
    processedSchema = jsonSchemaToZod(processedSchema as JsonSchema);
  }

  return processedSchema;
}

/**
 * Creates a LangChain DynamicStructuredTool from an MCP tool definition.
 * Handles schema processing, tool execution, and error handling.
 *
 * @param tool - MCP tool definition
 * @param serverName - Server name for logging and identification
 * @param client - MCP client for tool execution
 * @param llmProvider - LLM provider for schema compatibility
 * @param logger - Logger instance
 * @returns Configured DynamicStructuredTool ready for LangChain use
 *
 * @internal
 */
function createLangChainTool(
  tool: Tool,
  serverName: string,
  client: Client,
  llmProvider: LlmProvider,
  logger: McpToolsLogger
): DynamicStructuredTool {

  const processedSchema = processSchemaForLlmProvider(
    tool.inputSchema,
    llmProvider,
    serverName,
    tool.name,
    logger
  );

  return new DynamicStructuredTool({
    name: tool.name,
    description: tool.description || "",
    schema: processedSchema,

    func: async function(input) {
      logger.info(`MCP tool "${serverName}"/"${tool.name}" received input:`, input);

      try {
        // Execute tool call
        const result = await client?.request(
          {
            method: "tools/call",
            params: {
              name: tool.name,
              arguments: input,
            },
          },
          CallToolResultSchema
        );

        // Handles null/undefined cases gracefully
        if (!result?.content) {
          logger.info(`MCP tool "${serverName}"/"${tool.name}" received null/undefined result`);
          return "";
        }

        // Extract text content from tool results
        // MCP tools can return multiple content types, but this library currently uses
        // LangChain's 'content' response format which only supports text strings
        const textContent = result.content
          .filter(content => content.type === "text")
          .map(content => content.text)
          .join("\n\n");

        // Alternative approach using JSON serialization (preserved for reference):
        // const textItems = result.content
        //   .filter(content => content.type === "text")
        //   .map(content => content.text)
        // const textContent = JSON.stringify(textItems);

        // Log rough result size for monitoring
        const size = new TextEncoder().encode(textContent).length
        logger.info(`MCP tool "${serverName}"/"${tool.name}" received result (size: ${size})`);

        // If no text content, return a clear message describing the situation
        return textContent || "No text content available in response";

      } catch (error: unknown) {
          logger.warn(`MCP tool "${serverName}"/"${tool.name}" caused error: ${error}`);
          return `Error executing MCP tool: ${error}`;
      }
    },
  });
}

/**
 * Initializes a single MCP server and converts its capabilities into LangChain tools.
 * Sets up a connection to the server, retrieves available tools, and creates corresponding
 * LangChain tool instances with optional schema transformations for LLM compatibility.
 *
 * @param serverName - Unique identifier for the server instance
 * @param config - Server configuration including command, arguments, and environment variables
 * @param llmProvider - LLM provider for schema compatibility transformations (defaults to "none")
 * @param logger - McpToolsLogger instance for recording operation details
 *
 * @returns A promise that resolves to:
 *          - tools: Array of StructuredTool instances from this server
 *          - cleanup: Function to properly terminate the server connection
 *
 * @throws McpInitializationError if server initialization fails
 *         (includes connection errors, tool listing failures, configuration validation errors)
 *
 * @internal This function is meant to be called by convertMcpToLangchainTools
 */
async function convertSingleMcpToLangchainTools(
  serverName: string,
  config: SingleMcpServerConfig,
  llmProvider: LlmProvider,
  logger: McpToolsLogger
): Promise<{
  tools: StructuredTool[];
  cleanup: McpServerCleanupFn;
}> {
  let transport: Transport | null = null;
  try {
    let client: Client | null = null;

    logger.info(`MCP server "${serverName}": initializing with: ${JSON.stringify(config)}`);

    let url: URL | undefined = undefined;
    try {
      url = new URL((config as UrlBasedConfig).url);
    } catch {
      // Ignore
    }

    if (!config?.command && !url) {
      throw new McpInitializationError(
        serverName,
        `Failed to initialize MCP server: ${serverName}: Either a command or a valid URL must be specified`
      );
    }
    if (config?.command && url) {
      throw new McpInitializationError(
        serverName,
        `Configuration error: Cannot specify both 'command' (${config.command}) and 'url' (${url.href})`
      );
    }

    const transportType = config?.transport || config?.type;

    // Transport Selection Priority:
    // 1. Explicit transport/type field (must match URL protocol if URL provided)
    // 2. URL protocol auto-detection (http/https → StreamableHTTP, ws/wss → WebSocket)
    // 3. Command presence → Stdio transport
    // 4. Error if none of the above match
    //
    // Conflicts that cause errors:
    // - Both url and command specified
    // - transport/type doesn't match URL protocol
    // - transport requires URL but no URL provided
    // - transport requires command but no command provided
  
    if ((transportType === "http" || transportType === "streamable_http") ||
      (!transportType && (url?.protocol === "http:" || url?.protocol === "https:"))
    ) {
      if (!(url?.protocol === "http:" || url?.protocol === "https:"))  {
        throw new McpInitializationError(
          serverName,
          `Failed to initialize MCP server: ${serverName}: URL protocol to be http: or https: : ${url}`
        );
      }

      // Use the new auto-detection logic with fallback
      const urlConfig = config as UrlBasedConfig;
      
      // Try to connect with Streamable HTTP first, fallback to SSE on 4xx errors
      // Use the updated transport detection with MCP spec compliance
      transport = await createHttpTransportWithFallback(url, urlConfig, logger, serverName);
      logger.info(`MCP server "${serverName}": created transport, attempting connection`);

    } else if ((transportType === "ws" || transportType === "websocket") ||
      (!transportType && (url?.protocol === "ws:" || url?.protocol === "wss:"))
    ) {
      if (!(url?.protocol === "ws:" || url?.protocol === "wss:"))  {
        throw new McpInitializationError(
          serverName,
          `Failed to initialize MCP server: ${serverName}: URL protocol to be ws: or wss: : ${url}`
        );
      }
      transport = new WebSocketClientTransport(url);

    } else if ((transportType === "stdio" || !transportType && config?.command)) {
      if (!config?.command)  {
        throw new McpInitializationError(
          serverName,
          `Failed to initialize MCP server: ${serverName}: Command to be specified`
        );
      }
      // NOTE: Some servers (e.g. Brave) seem to require PATH to be set.
      // To avoid confusion, it was decided to automatically append it to the env
      // if not explicitly set by the config.
      const stdioServerConfig = config as CommandBasedConfig;
      const env = { ...stdioServerConfig.env };
      if (!env.PATH) {
        env.PATH = process.env.PATH || "";
      }

      transport = new StdioClientTransport({
        command: stdioServerConfig.command,
        args: stdioServerConfig.args,
        env,
        stderr: stdioServerConfig.stderr,
        cwd: stdioServerConfig.cwd
      });
    } else {
      throw new McpInitializationError(
        serverName,
        `Failed to initialize MCP server: ${serverName}: Unknown transport type: ${config?.transport}`
      );
    }

    // Only create client if not already created during auto-detection fallback
    if (!client) {
      client = new Client(
        {
          name: "mcp-client",
          version: "0.0.1",
        },
        {
          capabilities: {},
        }
      );

      await client.connect(transport);
      logger.info(`MCP server "${serverName}": connected`);
    }

    const toolsResponse = await client.request(
      { method: "tools/list" },
      ListToolsResultSchema
    );

    const tools = toolsResponse.tools.map((tool) =>
      createLangChainTool(tool, serverName, client, llmProvider, logger)
    );

    logger.info(`MCP server "${serverName}": ${tools.length} tool(s) available:`);
    tools.forEach((tool) => logger.info(`- ${tool.name}`));

    async function cleanup(): Promise<void> {
      if (transport) {
        await transport.close();
        logger.info(`MCP server "${serverName}": session closed`);
      }
    }

    return { tools, cleanup };
  } catch (error: unknown) {
    // Proper cleanup in case of initialization error
    if (transport) {
      try {
        await transport.close();
      } catch (cleanupError) {
        // Log cleanup error but don't let it override the original error
        logger.error(`Failed to cleanup during initialization error: ${cleanupError}`);
      }
    }
    throw new McpInitializationError(
      serverName,
      `Failed to initialize MCP server: ${serverName}: ${error instanceof Error ? error.message : String(error)}`,
      error
    );
  }
}

/**
 * Initializes multiple MCP (Model Context Protocol) servers and converts them into LangChain tools.
 * This function concurrently sets up all specified servers and aggregates their tools.
 *
 * @param configs - A mapping of server names to their respective configurations
 * @param options - Optional configuration settings
 * @param options.logLevel - Log verbosity level ("fatal" | "error" | "warn" | "info" | "debug" | "trace")
 * @param options.logger - Custom logger implementation that follows the McpToolsLogger interface.
 *                        If provided, overrides the default Logger instance.
 * @param options.llmProvider - LLM provider for schema compatibility transformations.
 *                             Performs provider-specific JSON schema modifications to prevent compatibility issues.
 *                             Set to "openai" for OpenAI models, "google_gemini"/"google_genai" for Google models,
 *                             "anthropic" for Claude models, or "none" for no transformation.
 *
 * @returns A promise that resolves to:
 *          - tools: Array of StructuredTool instances ready for use with LangChain
 *          - cleanup: Function to properly terminate all server connections
 *
 * @throws McpInitializationError if any server fails to initialize
 *         (includes connection errors, tool listing failures, configuration validation errors)
 *
 * @remarks
 * - Servers are initialized concurrently for better performance
 * - Configuration is validated and will throw errors for conflicts (e.g., both url and command specified)
 * - Schema transformations are applied based on llmProvider to ensure compatibility
 * - The cleanup function continues with remaining servers even if some cleanup operations fail
 *
 * @example
 * const { tools, cleanup } = await convertMcpToLangchainTools({
 *   filesystem: { command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "."] },
 *   fetch: { command: "uvx", args: ["mcp-server-fetch"] }
 * }, {
 *   llmProvider: "openai",
 *   logLevel: "debug"
 * });
 */
export async function convertMcpToLangchainTools(
  configs: McpServersConfig,
  options?: ConvertMcpToLangchainOptions
): Promise<{
  tools: StructuredTool[];
  cleanup: McpServerCleanupFn;
}> {
  const allTools: StructuredTool[] = [];
  const cleanupCallbacks: McpServerCleanupFn[] = [];
  const logger = options?.logger || new Logger({ level: options?.logLevel || "info" }) as McpToolsLogger;
  const llmProvider = options?.llmProvider || "none";

  if (llmProvider !== "none") {
    logger.info(`Converting MCP tool schemas for the LLM Provider: ${llmProvider}`);
  }

  const serverInitPromises = Object.entries(configs).map(async ([name, config]) => {
    const result = await convertSingleMcpToLangchainTools(name, config, llmProvider, logger);
    return { name, result };
  });

  // Track server names alongside their promises
  const serverNames = Object.keys(configs);

  // Concurrently initialize all the MCP servers
  const results = await Promise.allSettled(
    serverInitPromises
  );

  // Process successful initializations and log failures
  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      const { result: { tools, cleanup } } = result.value;
      allTools.push(...tools);
      cleanupCallbacks.push(cleanup);
    } else {
      logger.error(`MCP server "${serverNames[index]}": failed to initialize: ${result.reason.details}`);
      throw result.reason;
    }
  });

  async function cleanup(): Promise<void> {
    // Concurrently execute all the callbacks
    const results = await Promise.allSettled(cleanupCallbacks.map(callback => callback()));

    // Log any cleanup failures but continue with others
    // This ensures that a single server cleanup failure doesn't prevent cleanup of other servers
    const failures = results.filter(result => result.status === "rejected");
    failures.forEach((failure, index) => {
      logger.error(`MCP server "${serverNames[index]}": failed to close: ${failure.reason}`);
    });
  }

  logger.info(`MCP servers initialized: ${allTools.length} tool(s) available in total`);
  allTools.forEach((tool) => logger.debug(`- ${tool.name}`));

  return { tools: allTools, cleanup };
}
