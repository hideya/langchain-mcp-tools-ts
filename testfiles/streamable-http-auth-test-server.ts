import express from "express";
import cors from "cors";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

/**
 * ⚠️ TEST SERVER - NOT OAUTH 2.1 COMPLIANT
 * 
 * This test server implements a simplified authentication mechanism that does NOT
 * comply with OAuth 2.1 requirements. It's designed solely for testing MCP 
 * authentication integration with Streamable HTTP transport.
 *
 * This server demonstrates:
 * - Basic Bearer token authentication
 * - Session management for Streamable HTTP
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
const PORT = 3334;
const HOST = "0.0.0.0";

// Store active Streamable HTTP sessions
const transports = new Map();

// Enable extra debugging
const DEBUG = true;
function debug(...args: any[]) {
  if (DEBUG) {
    console.log("[DEBUG]", ...args);
  }
}

app.use(cors({ 
  origin: "*", 
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept", "Mcp-Session-Id", "X-Test-Header"]
}));

app.use(express.json({limit: "10mb"}));
app.use(express.urlencoded({ extended: true }));

// Factory function to create a fresh McpServer instance per session.
// A single McpServer instance cannot be reused across multiple connections:
// the SDK's Protocol.connect() throws "Already connected to a transport" if
// connect() is called again without first calling close() on the server itself.
function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "MCP Streamable HTTP Auth Test Server",
    version: "1.0.0"
  });

  // Add a simple echo tool
  server.tool(
    "echo",
    { message: z.string().describe("Message to echo back") },
    async ({ message }) => ({
      content: [{ type: "text", text: `[Streamable HTTP] ${message}` }]
    })
  );

  // Add an authenticated info tool
  server.tool(
    "server-info",
    {},
    async () => ({
      content: [{
        type: "text",
        text: "MCP Streamable HTTP Auth Test Server - Authentication successful!"
      }]
    })
  );

  return server;
}

// Root endpoint
app.get("/", (req: any, res: any) => {
  res.send("MCP Streamable HTTP Auth Test Server Running");
});

// Auth middleware
function authenticate(req: any, res: any, next: any) {
  debug("Authenticating Streamable HTTP request...");
  
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    console.log("Missing authorization header");
    return res.status(401).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Authorization header is required"
      },
      id: null
    });
  }
  
  if (!authHeader.startsWith("Bearer ")) {
    console.log("Invalid authorization format");
    return res.status(401).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Authorization header must use Bearer scheme"
      },
      id: null
    });
  }
  
  const token = authHeader.substring(7);
  if (!token.startsWith("test_token_")) {
    console.log("Invalid token value");
    return res.status(401).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Token is invalid or expired"
      },
      id: null
    });
  }
  
  debug("Valid test token:", authHeader);
  return next();
}

// Basic token endpoint
app.post("/token", (req: any, res: any) => {
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

// Main MCP endpoint for Streamable HTTP transport
app.all("/mcp", authenticate, async (req: any, res: any) => {
  debug(`Received ${req.method} request to /mcp`);
  debug("Headers:", req.headers);
  
  // Handle different HTTP methods for Streamable HTTP transport
  if (req.method === "POST") {
    // Handle MCP messages via POST
    const sessionId = req.headers['mcp-session-id'] as string;
    
    debug(`POST request with session ID: ${sessionId || 'none'}`);
    
    let transport: StreamableHTTPServerTransport;
    
    if (sessionId && transports.has(sessionId)) {
      // Reuse existing transport
      transport = transports.get(sessionId);
      debug(`Reusing existing transport for session: ${sessionId}`);
    } else {
      // Create new transport (for initialization or new session)
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        onsessioninitialized: (newSessionId) => {
          debug(`New session initialized: ${newSessionId}`);
          transports.set(newSessionId, transport);
        }
      });
      
      debug("Created new transport");
      
      // Clean up transport when closed
      transport.onclose = () => {
        if (transport.sessionId) {
          debug(`Cleaning up session: ${transport.sessionId}`);
          transports.delete(transport.sessionId);
        }
      };
      
      // Connect a fresh MCP server instance to this transport
      try {
        const mcpServer = createMcpServer();
        await mcpServer.connect(transport);
        debug("MCP server connected to new transport");
      } catch (error) {
        console.error("Error connecting MCP server:", error);
        return res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error during initialization"
          },
          id: null
        });
      }
    }
    
    // Handle the request through the transport
    try {
      await transport.handleRequest(req, res, req.body);
    } catch (error: any) {
      console.error("Error handling request:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: `Internal error: ${error.message}`
          },
          id: null
        });
      }
    }
    
  } else if (req.method === "GET") {
    // Handle SSE stream for server-to-client messages
    const sessionId = req.headers['mcp-session-id'] as string;
    
    if (!sessionId || !transports.has(sessionId)) {
      return res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Valid session ID required for GET requests"
        },
        id: null
      });
    }
    
    const transport = transports.get(sessionId);
    debug(`GET request for SSE stream, session: ${sessionId}`);
    
    try {
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error("Error handling GET request:", error);
      if (!res.headersSent) {
        res.status(500).send("Internal server error");
      }
    }
    
  } else if (req.method === "DELETE") {
    // Handle session termination
    const sessionId = req.headers['mcp-session-id'] as string;
    
    if (sessionId && transports.has(sessionId)) {
      const transport = transports.get(sessionId);
      debug(`Terminating session: ${sessionId}`);
      
      try {
        transport.close();
        transports.delete(sessionId);
        res.status(200).json({ message: "Session terminated" });
      } catch (error) {
        console.error("Error terminating session:", error);
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Error terminating session"
          },
          id: null
        });
      }
    } else {
      res.status(404).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Session not found"
        },
        id: null
      });
    }
    
  } else {
    // Unsupported method
    res.status(405).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed"
      },
      id: null
    });
  }
});

// CORS preflight
app.options("*", cors({
  origin: "*",
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept", "Mcp-Session-Id", "X-Test-Header"]
}));

// Start server
const server_instance = app.listen(PORT, HOST, () => {
  console.log(`MCP Streamable HTTP Auth Test Server running at http://${HOST}:${PORT}`);
  console.log(`For local testing, use: http://127.0.0.1:${PORT}`);
  console.log(`MCP endpoint: http://127.0.0.1:${PORT}/mcp`);
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
