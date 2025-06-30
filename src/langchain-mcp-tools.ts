import { IOType } from "node:child_process";
import { Stream } from "node:stream";
import { DynamicStructuredTool, StructuredTool } from "@langchain/core/tools";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport, SSEClientTransportOptions } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport,
    StreamableHTTPClientTransportOptions,
    StreamableHTTPReconnectionOptions
  } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { WebSocketClientTransport } from "@modelcontextprotocol/sdk/client/websocket.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { CallToolResultSchema, ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import { jsonSchemaToZod, JsonSchema } from "@h1deya/json-schema-to-zod";
import { z } from "zod";
import { Logger } from "./logger.js";


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

// Define a domain-specific logger interface
export interface McpToolsLogger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

/**
 * Options for configuring logging behavior.
 *
 * @public
 */
export interface LogOptions {
  logLevel?: "fatal" | "error" | "warn" | "info" | "debug" | "trace";
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

export interface McpServerCleanupFn {
  (): Promise<void>;
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
 * Initializes multiple MCP (Model Context Protocol) servers and converts them into LangChain tools.
 * This function concurrently sets up all specified servers and aggregates their tools.
 *
 * @param configs - A mapping of server names to their respective configurations
 * @param options - Optional configuration settings
 * @param options.logLevel - Log verbosity level ("fatal" | "error" | "warn" | "info" | "debug" | "trace")
 * @param options.logger - Custom logger implementation that follows the McpToolsLogger interface.
 *                        If provided, overrides the default Logger instance.
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
 * - The cleanup function continues with remaining servers even if some cleanup operations fail
 *
 * @example
 * const { tools, cleanup } = await convertMcpToLangchainTools({
 *   filesystem: { command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "."] },
 *   fetch: { command: "uvx", args: ["mcp-server-fetch"] }
 * });
 */
export async function convertMcpToLangchainTools(
  configs: McpServersConfig,
  options?: LogOptions & { logger?: McpToolsLogger }
): Promise<{
  tools: StructuredTool[];
  cleanup: McpServerCleanupFn;
}> {
  const allTools: StructuredTool[] = [];
  const cleanupCallbacks: McpServerCleanupFn[] = [];
  const logger = options?.logger || new Logger({ level: options?.logLevel || "info" }) as McpToolsLogger;

  const serverInitPromises = Object.entries(configs).map(async ([name, config]) => {
    const result = await convertSingleMcpToLangchainTools(name, config, logger);
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

/**
 * Sanitizes a JSON Schema to make it compatible with Google Gemini API.
 * 
 * Gemini has strict limitations and does NOT support:
 * - The `nullable` property at all
 * - `anyOf`/`oneOf`/`allOf` alongside other properties  
 * - Most string formats except "enum" and "date-time"
 * - `exclusiveMinimum`/`exclusiveMaximum`
 * 
 * @param schema - The JSON schema to sanitize
 * @param logger - Optional logger for reporting sanitization actions
 * @param toolName - Optional tool name for logging context
 * @returns A sanitized schema compatible with Gemini
 *
 * @internal
 */
function sanitizeSchemaForGemini(schema: any, logger?: McpToolsLogger, toolName?: string): any {
  if (typeof schema !== "object" || schema === null) {
    return schema;
  }
  
  const sanitized = { ...schema };
  const removedProperties: string[] = [];
  const convertedProperties: string[] = [];
  
  // CRITICAL: Remove nullable property entirely - Gemini doesn't support it at all
  if (sanitized.nullable !== undefined) {
    removedProperties.push("nullable");
    delete sanitized.nullable;
  }
  
  // Remove unsupported properties
  if (sanitized.exclusiveMinimum !== undefined) {
    removedProperties.push("exclusiveMinimum");
    delete sanitized.exclusiveMinimum;
  }
  if (sanitized.exclusiveMaximum !== undefined) {
    removedProperties.push("exclusiveMaximum");
    delete sanitized.exclusiveMaximum;
  }
  
  // Convert exclusiveMinimum/Maximum to minimum/maximum if needed
  if (schema.exclusiveMinimum !== undefined) {
    sanitized.minimum = schema.exclusiveMinimum;
    convertedProperties.push("exclusiveMinimum → minimum");
  }
  if (schema.exclusiveMaximum !== undefined) {
    sanitized.maximum = schema.exclusiveMaximum;
    convertedProperties.push("exclusiveMaximum → maximum");
  }
  
  // Remove unsupported string formats (Gemini only supports "enum" and "date-time")
  if (sanitized.type === "string" && sanitized.format) {
    const supportedFormats = ["enum", "date-time"];
    if (!supportedFormats.includes(sanitized.format)) {
      removedProperties.push(`format: ${sanitized.format}`);
      delete sanitized.format;
    }
  }
  
  // Handle Gemini's restriction: anyOf/oneOf/allOf cannot coexist with other properties
  if (sanitized.anyOf || sanitized.oneOf || sanitized.allOf) {
    const unionField = sanitized.anyOf ? 'anyOf' : (sanitized.oneOf ? 'oneOf' : 'allOf');
    const unionValue = sanitized[unionField];
    
    // Check if there are other properties besides the union
    const otherProps = Object.keys(sanitized).filter(key => 
      key !== unionField && 
      key !== '$schema' && 
      key !== '$id'  // Allow schema metadata
    );
    
    if (otherProps.length > 0) {
      removedProperties.push(`other properties alongside ${unionField}: ${otherProps.join(", ")}`);
      
      // Create a clean schema with only the union
      const cleanSchema = { [unionField]: unionValue };
      
      // Recursively process the union options
      cleanSchema[unionField] = unionValue.map((subSchema: any) => 
        sanitizeSchemaForGemini(subSchema, logger, toolName)
      );
      
      return cleanSchema;
    }
  }

  // Log sanitization actions for this level
  if (logger && toolName && (removedProperties.length > 0 || convertedProperties.length > 0)) {
    const changes = [];
    if (removedProperties.length > 0) {
      changes.push(`removed: ${removedProperties.join(", ")}`);
    }
    if (convertedProperties.length > 0) {
      changes.push(`converted: ${convertedProperties.join(", ")}`);
    }
    logger.warn(`MCP tool "${toolName}": schema sanitized for Gemini compatibility (${changes.join("; ")})`);
  }
  
  // Recursively process nested objects and arrays
  if (sanitized.properties) {
    sanitized.properties = Object.fromEntries(
      Object.entries(sanitized.properties).map(([key, value]) => [
        key,
        sanitizeSchemaForGemini(value, logger, toolName)
      ])
    );
  }
  
  if (sanitized.anyOf) {
    sanitized.anyOf = sanitized.anyOf.map((subSchema: any) => sanitizeSchemaForGemini(subSchema, logger, toolName));
  }
  
  if (sanitized.oneOf) {
    sanitized.oneOf = sanitized.oneOf.map((subSchema: any) => sanitizeSchemaForGemini(subSchema, logger, toolName));
  }
  
  if (sanitized.allOf) {
    sanitized.allOf = sanitized.allOf.map((subSchema: any) => sanitizeSchemaForGemini(subSchema, logger, toolName));
  }
  
  if (sanitized.items) {
    sanitized.items = sanitizeSchemaForGemini(sanitized.items, logger, toolName);
  }
  
  if (sanitized.additionalProperties && typeof sanitized.additionalProperties === "object") {
    sanitized.additionalProperties = sanitizeSchemaForGemini(sanitized.additionalProperties, logger, toolName);
  }
  
  return sanitized;
}

/**
 * Transforms a JSON Schema to be compatible with OpenAI's Structured Outputs requirements.
 * 
 * @param schema - The JSON schema to transform for OpenAI compatibility
 * @returns A transformed schema where all optional fields are also nullable
 *
 * @internal
 */
function makeJsonSchemaOpenAICompatible(schema: any): any {
  if (typeof schema !== "object" || schema === null) {
    return schema;
  }

  const result = { ...schema };

  // Handle object properties
  if (result.properties) {
    const processedProperties: Record<string, any> = {};
    const required = new Set(result.required || []);

    for (const [key, propSchema] of Object.entries(result.properties)) {
      const processedProp = makeJsonSchemaOpenAICompatible(propSchema);
      
      // If the field is not required, make it nullable
      if (!required.has(key)) {
        if (processedProp.type && !processedProp.nullable) {
          processedProp.nullable = true;
        } else if (processedProp.anyOf && !processedProp.anyOf.some((s: any) => s.type === "null")) {
          processedProp.anyOf = [...processedProp.anyOf, { type: "null" }];
        } else if (processedProp.oneOf && !processedProp.oneOf.some((s: any) => s.type === "null")) {
          processedProp.oneOf = [...processedProp.oneOf, { type: "null" }];
        }
      }
      
      processedProperties[key] = processedProp;
    }
    
    result.properties = processedProperties;
  }

  // Handle anyOf/oneOf/allOf recursively
  if (result.anyOf) {
    result.anyOf = result.anyOf.map((subSchema: any) => makeJsonSchemaOpenAICompatible(subSchema));
  }
  
  if (result.oneOf) {
    result.oneOf = result.oneOf.map((subSchema: any) => makeJsonSchemaOpenAICompatible(subSchema));
  }
  
  if (result.allOf) {
    result.allOf = result.allOf.map((subSchema: any) => makeJsonSchemaOpenAICompatible(subSchema));
  }

  // Handle array items
  if (result.items) {
    if (Array.isArray(result.items)) {
      result.items = result.items.map((item: any) => makeJsonSchemaOpenAICompatible(item));
    } else {
      result.items = makeJsonSchemaOpenAICompatible(result.items);
    }
  }

  // Handle additionalProperties
  if (result.additionalProperties && typeof result.additionalProperties === "object") {
    result.additionalProperties = makeJsonSchemaOpenAICompatible(result.additionalProperties);
  }

  // Handle definitions (common in complex schemas)
  if (result.definitions || result.$defs) {
    const defsKey = result.definitions ? 'definitions' : '$defs';
    const processedDefs: Record<string, any> = {};
    
    for (const [key, defSchema] of Object.entries(result[defsKey])) {
      processedDefs[key] = makeJsonSchemaOpenAICompatible(defSchema);
    }
    
    result[defsKey] = processedDefs;
  }

  return result;
}

/**
 * Creates Streamable HTTP transport options from configuration.
 * Consolidates repeated option configuration logic into a single reusable function.
 *
 * @param config - URL-based server configuration
 * @param logger - Logger instance for recording authentication setup
 * @param serverName - Server name for logging context
 * @returns Configured StreamableHTTPClientTransportOptions or undefined if no options needed
 * 
 * @internal This function is meant to be used internally by transport creation functions
 */
function createStreamableHttpOptions(
  config: UrlBasedConfig,
  logger: McpToolsLogger,
  serverName: string
): StreamableHTTPClientTransportOptions | undefined {
  const options: StreamableHTTPClientTransportOptions = {};
  
  if (config.streamableHTTPOptions) {
    if (config.streamableHTTPOptions.authProvider) {
      options.authProvider = config.streamableHTTPOptions.authProvider;
      logger.info(`MCP server "${serverName}": configuring Streamable HTTP with authentication provider`);
    }
    
    if (config.streamableHTTPOptions.requestInit) {
      options.requestInit = config.streamableHTTPOptions.requestInit;
    }
    
    if (config.streamableHTTPOptions.reconnectionOptions) {
      options.reconnectionOptions = config.streamableHTTPOptions.reconnectionOptions;
    }

    if (config.streamableHTTPOptions.sessionId) {
      options.sessionId = config.streamableHTTPOptions.sessionId;
    }

  } else if (config.headers) {
    options.requestInit = { headers: config.headers };
  }
  
  return Object.keys(options).length > 0 ? options : undefined;
}

/**
 * Creates SSE transport options from configuration.
 * Consolidates repeated option configuration logic into a single reusable function.
 *
 * @param config - URL-based server configuration
 * @param logger - Logger instance for recording authentication setup
 * @param serverName - Server name for logging context
 * @returns Configured SSEClientTransportOptions or undefined if no options needed
 * 
 * @internal This function is meant to be used internally by transport creation functions
 */
function createSseOptions(
  config: UrlBasedConfig,
  logger: McpToolsLogger,
  serverName: string
): SSEClientTransportOptions | undefined {
  const options: SSEClientTransportOptions = {};
  
  if (config.sseOptions) {
    if (config.sseOptions.authProvider) {
      options.authProvider = config.sseOptions.authProvider;
      logger.info(`MCP server "${serverName}": configuring SSE with authentication provider`);
    }
    
    if (config.sseOptions.eventSourceInit) {
      options.eventSourceInit = config.sseOptions.eventSourceInit;
    }
    
    if (config.sseOptions.requestInit) {
      options.requestInit = config.sseOptions.requestInit;
    } else if (config.headers) {
      options.requestInit = { headers: config.headers };
    }
  }
  
  return Object.keys(options).length > 0 ? options : undefined;
}

/**
 * Determines if an error represents a 4xx HTTP status code.
 * Used to decide whether to fall back from Streamable HTTP to SSE transport.
 *
 * @param error - The error to check
 * @returns true if the error represents a 4xx HTTP status
 * 
 * @internal This function is meant to be used internally by createHttpTransportWithFallback
 */
function is4xxError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  
  // Check for common error patterns that indicate 4xx responses
  const errorObj = error as any;
  
  // Check if it"s a fetch Response error with status
  if (errorObj.status && typeof errorObj.status === "number") {
    return errorObj.status >= 400 && errorObj.status < 500;
  }
  
  // Check if it's wrapped in a Response object
  if (errorObj.response && errorObj.response.status && typeof errorObj.response.status === "number") {
    return errorObj.response.status >= 400 && errorObj.response.status < 500;
  }
  
  // Check for error messages that typically indicate 4xx errors
  const message = errorObj.message || errorObj.toString();
  if (typeof message === "string") {
    return /4[0-9]{2}/.test(message) || 
           message.includes("Bad Request") ||
           message.includes("Unauthorized") ||
           message.includes("Forbidden") ||
           message.includes("Not Found") ||
           message.includes("Method Not Allowed");
  }
  
  return false;
}

/**
 * Tests MCP server transport support using direct POST InitializeRequest.
 * Follows the official MCP specification's recommended approach for backwards compatibility.
 *
 * See: https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#backwards-compatibility
 *
 * @param url - The URL to test
 * @param config - URL-based server configuration
 * @param logger - Logger instance for recording test attempts
 * @param serverName - Server name for logging context
 * @returns A promise that resolves to the detected transport type
 * 
 * @internal This function is meant to be used internally by createHttpTransportWithFallback
 */
async function testTransportSupport(
  url: URL,
  config: UrlBasedConfig,
  logger: McpToolsLogger,
  serverName: string
): Promise<"streamable_http" | "sse"> {
  logger.debug(`MCP server "${serverName}": testing Streamable HTTP support`);
  
  // Create InitializeRequest as per MCP specification
  const initRequest = {
    jsonrpc: "2.0" as const,
    id: `transport-test-${Date.now()}`,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05", // MCP Protocol version specified by the MCP specification for transport detection
      capabilities: {},
      clientInfo: {
        name: "mcp-transport-test",
        version: "1.0.0"
      }
    }
  };

  // Prepare headers as required by MCP spec
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream" // Required by spec
  };

  // Add authentication headers if available
  if (config.streamableHTTPOptions?.authProvider) {
    try {
      const tokens = await config.streamableHTTPOptions.authProvider.tokens();
      if (tokens?.access_token) {
        headers["Authorization"] = `${tokens.token_type || "Bearer"} ${tokens.access_token}`;
        logger.debug(`MCP server "${serverName}": added authentication to transport test`);
      }
    } catch (authError) {
      logger.debug(`MCP server "${serverName}": authentication setup failed for transport test:`, authError);
    }
  }

  // Merge custom headers from config
  if (config.streamableHTTPOptions?.requestInit?.headers) {
    Object.assign(headers, config.streamableHTTPOptions.requestInit.headers);
  }
  if (config.sseOptions?.requestInit?.headers) {
    Object.assign(headers, config.sseOptions.requestInit.headers);
  }
  if (config.headers) {
    Object.assign(headers, config.headers);
  }

  try {
    logger.debug(`MCP server "${serverName}": POST InitializeRequest to test Streamable HTTP support`);
    
    // POST InitializeRequest directly to test Streamable HTTP support
    const response = await fetch(url.toString(), {
      method: "POST",
      headers,
      body: JSON.stringify(initRequest),
      ...config.streamableHTTPOptions?.requestInit
    });

    logger.debug(`MCP server "${serverName}": transport test response: ${response.status} ${response.statusText}`);
    
    if (response.ok) {
      // Success indicates Streamable HTTP support
      logger.info(`MCP server "${serverName}": detected Streamable HTTP transport support`);
      return "streamable_http";
    } else if (response.status >= 400 && response.status < 500) {
      // 4xx error indicates fallback to SSE per MCP spec
      logger.info(`MCP server "${serverName}": received ${response.status}, falling back to SSE transport`);
      return "sse";
    } else {
      // Other errors should be re-thrown
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  } catch (error) {
    // Network errors or other issues
    logger.debug(`MCP server "${serverName}": transport test failed:`, error);
    
    // Check if it's a 4xx-like error
    if (is4xxError(error)) {
      logger.info(`MCP server "${serverName}": transport test failed with 4xx-like error, falling back to SSE`);
      return "sse";
    }
    
    // Re-throw other errors (network issues, etc.)
    throw error;
  }
}

/**
 * Creates an HTTP transport with automatic fallback from Streamable HTTP to SSE.
 * Follows the MCP specification recommendation to test with direct POST InitializeRequest first,
 * then fall back to SSE if a 4xx error is encountered.
 *
 * See: https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#backwards-compatibility
 *
 * @param url - The URL to connect to
 * @param config - URL-based server configuration
 * @param logger - Logger instance for recording connection attempts
 * @param serverName - Server name for logging context
 * @returns A promise that resolves to a configured Transport
 * 
 * @internal This function is meant to be used internally by convertSingleMcpToLangchainTools
 */
async function createHttpTransportWithFallback(
  url: URL,
  config: UrlBasedConfig,
  logger: McpToolsLogger,
  serverName: string
): Promise<Transport> {
  const transportType = config.transport || config.type;
  // If transport is explicitly specified, respect user's choice
  if (transportType === "streamable_http" || transportType === "http") {
    logger.debug(`MCP server "${serverName}": using explicitly configured Streamable HTTP transport`);
    const options = createStreamableHttpOptions(config, logger, serverName);
    return new StreamableHTTPClientTransport(url, options);
  }
  
  if (transportType === "sse") {
    logger.debug(`MCP server "${serverName}": using explicitly configured SSE transport`);
    const options = createSseOptions(config, logger, serverName);
    return new SSEClientTransport(url, options);
  }
  
  // Auto-detection: test with POST InitializeRequest per MCP specification
  logger.debug(`MCP server "${serverName}": auto-detecting transport using MCP specification method`);
  
  try {
    const detectedTransport = await testTransportSupport(url, config, logger, serverName);
    
    if (detectedTransport === "streamable_http") {
      const options = createStreamableHttpOptions(config, logger, serverName);
      return new StreamableHTTPClientTransport(url, options);
    } else {
      const options = createSseOptions(config, logger, serverName);
      return new SSEClientTransport(url, options);
    }
    
  } catch (error) {
    // If transport detection fails completely, log error and re-throw
    logger.error(`MCP server "${serverName}": transport detection failed:`, error);
    throw error;
  }
}

/**
 * Initializes a single MCP server and converts its capabilities into LangChain tools.
 * Sets up a connection to the server, retrieves available tools, and creates corresponding
 * LangChain tool instances.
 *
 * @param serverName - Unique identifier for the server instance
 * @param config - Server configuration including command, arguments, and environment variables
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
        `Configuration error: Cannot specify both 'command' (${config.command}) and 'url' (${url.href}). Use 'command' for local servers or 'url' for remote servers.`
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
      let connectionSucceeded = false;
      
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

    const tools = toolsResponse.tools.map((tool) => {
      // 1. Start with original MCP schema
      let processedSchema = tool.inputSchema;

      // // 2. FIRST: Sanitize for Gemini (removes conflicts, cleans up anyOf issues, removes nullable)
      processedSchema = sanitizeSchemaForGemini(processedSchema, logger, `${serverName}/${tool.name}`);

      // // 3. THEN: Add OpenAI nullability (but skip nullable properties for Gemini compatibility)
      // processedSchema = makeJsonSchemaOpenAICompatible(processedSchema);

      // 4. Convert to Zod
      let zodSchema = jsonSchemaToZod(processedSchema as JsonSchema) as z.ZodTypeAny;
      
      // Ensure we have a ZodObject for DynamicStructuredTool
      const finalSchema = zodSchema instanceof z.ZodObject ? zodSchema : z.object({});
      
      return new DynamicStructuredTool({
        name: tool.name,
        description: tool.description || "",
        schema: finalSchema,

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
    });

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
