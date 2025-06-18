import express from "express";
import cors from "cors";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const app = express();
const PORT = 3335;
const HOST = "0.0.0.0";

// Enable extra debugging
const DEBUG = true;
function debug(...args: any[]) {
  if (DEBUG) {
    console.log("[DEBUG]", ...args);
  }
}

app.use(cors({ 
  origin: "*", 
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Accept"]
}));

app.use(express.json({limit: "10mb"}));
app.use(express.urlencoded({ extended: true }));

// Factory function to create a new MCP server instance
function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "MCP Streamable HTTP Stateless Test Server",
    version: "1.0.0"
  });

  // Add a simple echo tool
  server.tool(
    "echo",
    { message: z.string().describe("Message to echo back") },
    async ({ message }) => ({
      content: [{ type: "text", text: `[Stateless Streamable HTTP] ${message}` }]
    })
  );

  // Add a stateless info tool
  server.tool(
    "server-info",
    {},
    async () => ({
      content: [{ 
        type: "text", 
        text: `MCP Streamable HTTP Stateless Test Server - Request handled at ${new Date().toISOString()}` 
      }]
    })
  );

  // Add a random number tool to demonstrate statelessness
  server.tool(
    "random-number",
    { 
      min: z.number().optional().describe("Minimum value (default: 1)"),
      max: z.number().optional().describe("Maximum value (default: 100)")
    },
    async ({ min = 1, max = 100 }) => {
      const randomNum = Math.floor(Math.random() * (max - min + 1)) + min;
      return {
        content: [{ 
          type: "text", 
          text: `Random number between ${min} and ${max}: ${randomNum}` 
        }]
      };
    }
  );

  return server;
}

// Root endpoint
app.get("/", (req, res) => {
  res.send("MCP Streamable HTTP Stateless Test Server Running");
});

// Main MCP endpoint for stateless Streamable HTTP transport
app.post('/mcp', async (req, res) => {
  debug(`Received POST request to /mcp`);
  debug("Headers:", req.headers);
  debug("Body preview:", JSON.stringify(req.body).substring(0, 100) + "...");
  
  // In stateless mode, create a new instance of transport and server for each request
  // to ensure complete isolation. A single instance would cause request ID collisions
  // when multiple clients connect concurrently.
  
  try {
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // Key: No session management for stateless operation
    });
    
    debug("Created new server and transport instances");
    
    // Clean up when request is closed
    res.on('close', () => {
      debug('Request closed, cleaning up...');
      transport.close();
      // Note: McpServer doesn't have a close() method, it's cleaned up automatically
    });
    
    // Connect server to transport
    await server.connect(transport);
    debug("MCP server connected to transport");
    
    // Handle the request
    await transport.handleRequest(req, res, req.body);
    debug("Request handled successfully");
    
  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      });
    }
  }
});

// For stateless servers, GET and DELETE are typically not needed or supported
app.get('/mcp', async (req, res) => {
  debug('Received GET request to /mcp - not supported in stateless mode');
  res.writeHead(405).end(JSON.stringify({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "GET method not supported in stateless mode. Use POST for all MCP communication."
    },
    id: null
  }));
});

app.delete('/mcp', async (req, res) => {
  debug('Received DELETE request to /mcp - not supported in stateless mode');
  res.writeHead(405).end(JSON.stringify({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "DELETE method not supported in stateless mode. No sessions to terminate."
    },
    id: null
  }));
});

// CORS preflight
app.options("*", cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Accept"]
}));

// Start server
const serverInstance = app.listen(PORT, HOST, () => {
  console.log(`MCP Streamable HTTP Stateless Test Server running at http://${HOST}:${PORT}`);
  console.log(`For local testing, use: http://127.0.0.1:${PORT}`);
  console.log(`MCP endpoint: http://127.0.0.1:${PORT}/mcp`);
  console.log();
  console.log("🔧 Stateless Mode Benefits:");
  console.log("  • No session management required");
  console.log("  • Each request is completely isolated");
  console.log("  • Horizontally scalable");
  console.log("  • Simple deployment");
  console.log("  • No memory leaks from accumulated state");
});

// Handle shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down stateless server...");
  
  serverInstance.close(() => {
    console.log("Stateless server stopped");
    process.exit(0);
  });
});
