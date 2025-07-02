import { SSEClientTransport, SSEClientTransportOptions } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport,
    StreamableHTTPClientTransportOptions,
  } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

import { McpToolsLogger, UrlBasedConfig } from "./langchain-mcp-tools.js";

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
export function createStreamableHttpOptions(
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
export function createSseOptions(
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
export function is4xxError(error: unknown): boolean {
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
export async function testTransportSupport(
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
export async function createHttpTransportWithFallback(
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
