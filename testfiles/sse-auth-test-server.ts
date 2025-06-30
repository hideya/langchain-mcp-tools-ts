import express from "express";
import cors from "cors";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";

/**
 * ⚠️ TEST SERVER - NOT OAUTH 2.1 COMPLIANT
 *
 * This test server implements a simplified authentication mechanism that does NOT
 * comply with OAuth 2.1 requirements. It's designed solely for testing MCP 
 * authentication integration with SSE transport.
 *
 * IMPORTANT: SSE transport is deprecated as of MCP specification 2025-03-26.
 * Use Streamable HTTP transport for new implementations.
 *
 * This server demonstrates:
 * - Basic Bearer token authentication
 * - Session management for SSE transport
 * - MCP tool integration with authentication
 *
 * For production use, implement a proper OAuth 2.1 server with:
 * - PKCE (Proof Key for Code Exchange) - REQUIRED in OAuth 2.1
 * - Authorization endpoint with user consent flow
 * - Token endpoint with proper code exchange
 * - Authorization Server Metadata (/.well-known/oauth-authorization-server)
 * - Secure token generation, validation, and refresh
 * - Dynamic Client Registration (RFC7591) - RECOMMENDED
 *
 * Consider using production-ready OAuth 2.1 libraries:
 * - @auth0/auth0-spa-js (client) + Auth0 (server)
 * - oidc-client-ts (client) + IdentityServer, Keycloak (server)
 * - passport-oauth2 + node-oauth2-server
 * - express-oauth-server
 */

const app = express();
const PORT = 3333;
const HOST = "0.0.0.0";

// Store active SSE sessions
const transports = new Map();

// Enable extra debugging
const DEBUG = true;
function debug(...args) {
  if (DEBUG) {
    console.log("[DEBUG]", ...args);
  }
}

app.use(cors({ 
  origin: "*", 
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept", "X-Test-Header"]
}));

// Only parse JSON for non-SSE endpoint requests
const jsonParser = express.json({limit: "10mb"});
app.use((req, res, next) => {
  // Skip JSON parsing for the SSE POST endpoint
  if (req.path === "/sse" && req.method === "POST") {
    return next();
  }
  // Apply JSON parsing for all other routes
  return jsonParser(req, res, next);
});

app.use(express.urlencoded({ extended: true }));

// Create an MCP server instance
const server = new McpServer({
  name: "MCP SSE Auth Test Server",
  version: "1.0.0"
});

// Add a simple echo tool
server.tool(
  "echo",
  { message: z.string().describe("Message to echo back") },
  async ({ message }) => ({
    content: [{ type: "text", text: message }]
  })
);

// Root endpoint
app.get("/", (req, res) => {
  res.send("MCP SSE Auth Test Server Running");
});

// Auth middleware
function authenticate(req, res, next) {
  debug("Authenticating request...");
  
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    console.log("Missing authorization header");
    return res.status(401).json({
      error: {
        code: "missing_token",
        message: "Authorization header is required"
      }
    });
  }
  
  if (!authHeader.startsWith("Bearer ")) {
    console.log("Invalid authorization format");
    return res.status(401).json({
      error: {
        code: "invalid_token_format",
        message: "Authorization header must use Bearer scheme"
      }
    });
  }
  
  const token = authHeader.substring(7);
  if (!token.startsWith("test_token_")) {
    console.log("Invalid token value");
    return res.status(401).json({
      error: {
        code: "invalid_token",
        message: "Token is invalid or expired"
      }
    });
  }
  
  debug("Valid test token:", authHeader);
  return next();
}

// Basic token endpoint
app.post("/token", (req, res) => {
  console.log("Token request:", req.body);
  
  const clientId = req.body.client_id || "test_client_id";
  
  const tokens = {
    access_token: `test_token_${clientId}`,
    token_type: "Bearer",
    expires_in: 3600,
    refresh_token: `refresh_token_${clientId}`
  };
  
  console.log("Issuing tokens for client:", clientId);
  res.json(tokens);
});

// SSE endpoint
app.get("/sse", authenticate, (req, res) => {
  console.log("SSE connection from:", req.headers["user-agent"]);
  
  // Create a new SSE transport for this connection
  const transport = new SSEServerTransport("/sse", res);
  const sessionId = transport.sessionId;
  transports.set(sessionId, transport);
  
  console.log(`Session created: ${sessionId}`);
  
  // Setup cleanup when connection closes
  req.on("close", () => {
    console.log(`Client closed connection for session ${sessionId}`);
    transports.delete(sessionId);
    console.log(`Session ${sessionId} removed from transports map`);
  });
  
  // Connect the transport to our MCP server
  server.connect(transport)
    .then(() => {
      console.log(`MCP server connected to transport ${sessionId}`);
    })
    .catch(error => {
      console.error(`Error connecting MCP server:`, error);
      // Add more detailed error info
      if (error.stack) {
        console.error("Stack trace:", error.stack);
      }
      transports.delete(sessionId);
    });
});

// Handle messages endpoint - as query parameter (required by SSEServerTransport) 
app.post("/sse", authenticate, async (req, res) => {
  const sessionId = req.query.sessionId as string;
  
  // Handle transport detection per MCP specification
  // If no sessionId, this is likely a transport detection POST InitializeRequest
  if (!sessionId) {
    console.log("[SERVER] POST request to /sse without sessionId - returning 405 for transport detection");
    return res.status(405).json({
      error: {
        code: "method_not_allowed",
        message: "This server only supports SSE transport. Use GET for SSE connection."
      }
    });
  }
  
  debug(`Received message for session: ${sessionId}`);
  debug("Headers:", req.headers);
  
  // Get the transport for this session
  const transport = transports.get(sessionId);
  
  if (!transport) {
    console.log(`Session not found: ${sessionId}`);
    return res.status(404).json({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32001, message: "Session not found" }
    });
  }
  
  try {
    // Simply let the transport handle the message
    // It will handle parsing the body internally
    await transport.handlePostMessage(req, res);
  } catch (error) {
    console.error(`Error handling message:`, error);
    res.status(500).json({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32603, message: `Internal error: ${error.message}` }
    });
  }
});

// CORS preflight
app.options("*", cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept", "X-Test-Header"]
}));

// Start server
const server_instance = app.listen(PORT, HOST, () => {
  console.log(`MCP SSE Auth Test Server running at http://${HOST}:${PORT}`);
  console.log(`For local testing, use: http://127.0.0.1:${PORT}`);
});

// Handle shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down...");
  
  // Close all active transports
  for (const [sessionId, transport] of transports.entries()) {
    console.log(`Closing transport for session ${sessionId}`);
    transport.close();
  }
  
  server_instance.close(() => {
    console.log("Server stopped");
    process.exit(0);
  });
});