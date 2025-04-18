import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Setup the Express server
const app = express();
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Simple in-memory token management
const validTokens = new Set<string>();
const transports = new Map<string, SSEServerTransport>();

// Create an MCP server
const server = new Server(
  {
    name: "Test Auth MCP Server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Very basic auth token validation middleware
const authenticateToken = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  console.log(`\nAuth check - Header: ${authHeader}`);
  
  if (!token) {
    console.log('No token provided');
    return res.status(401).json({ error: 'Unauthorized - No token provided' });
  }
  
  // For testing purposes, let's accept any token prefixed with "test_"
  if (token.startsWith('test_')) {
    console.log('Accept test token for development');
    validTokens.add(token);
    next();
    return;
  }

  if (!validTokens.has(token)) {
    console.log('Invalid token');
    return res.status(401).json({ error: 'Unauthorized - Invalid token' });
  }
  
  console.log('Valid token - access granted');
  next();
};

// Configure server tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  console.log("Handling tools/list request");
  return {
    tools: [
      {
        name: "greet",
        description: "Greet someone by name",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Name of the person to greet"
            }
          },
          required: ["name"]
        }
      },
      {
        name: "getCurrentTime",
        description: "Get the current server time",
        inputSchema: {
          type: "object",
          properties: {}
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  console.log(`Handling tool call: ${request.params.name}`, request.params.arguments);
  
  switch (request.params.name) {
    case "greet":
      return {
        content: [
          {
            type: "text",
            text: `Hello, ${request.params.arguments.name}! Welcome to the secure MCP server.`
          }
        ]
      };
      
    case "getCurrentTime":
      return {
        content: [
          {
            type: "text",
            text: `The current server time is: ${new Date().toLocaleString()}`
          }
        ]
      };
      
    default:
      throw new Error(`Unknown tool: ${request.params.name}`);
  }
});

// OAuth token endpoint
app.post('/token', (req, res) => {
  console.log('\nToken request received:');
  console.log(req.body);
  
  const { grant_type, client_id, code, code_verifier, refresh_token } = req.body;

  // Handle authorization code exchange
  if (grant_type === 'authorization_code' && code && code_verifier) {
    // In a real implementation, you would validate the code and code_verifier
    // For this example, we'll accept any code that starts with "valid_"
    if (code.startsWith('valid_')) {
      // For testing, use a consistent token for easier debugging
      const token = `test_token_${client_id}`;
      validTokens.add(token);
      
      console.log(`Issuing access token: ${token} (valid tokens: ${validTokens.size})`);
      
      return res.json({
        access_token: token,
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: `refresh_${token}`
      });
    }
  }
  
  // Handle refresh token
  if (grant_type === 'refresh_token' && refresh_token) {
    // In a real implementation, you would validate the refresh token
    // For this example, we'll accept any refresh token that starts with "refresh_"
    if (refresh_token.startsWith('refresh_')) {
      // For testing, use a consistent token
      const token = `test_refreshed_${client_id}`;
      validTokens.add(token);
      
      return res.json({
        access_token: token,
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: `refresh_${token}`
      });
    }
  }
  
  console.log('Invalid token request');
  res.status(400).json({ error: 'invalid_grant' });
});

// OAuth authorization endpoint
app.get('/authorize', (req, res) => {
  const { client_id, redirect_uri, code_challenge, code_challenge_method, response_type } = req.query;
  
  // In a real implementation, you would validate these parameters
  console.log('Authorization request received:');
  console.log('- Client ID:', client_id);
  console.log('- Redirect URI:', redirect_uri);
  console.log('- Code Challenge:', code_challenge);
  
  // For our test purposes, we'll simulate the user consent page
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Test OAuth Consent</title>
      <style>
        body { font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; }
        button { padding: 10px 20px; background: #4285f4; color: white; border: none; border-radius: 4px; cursor: pointer; }
      </style>
    </head>
    <body>
      <h1>Test OAuth Consent</h1>
      <p>This is a simulated OAuth consent screen. In a real application, the user would grant or deny access here.</p>
      <p>Client ID: ${client_id}</p>
      <p>For testing, click the button below to simulate granting access:</p>
      <form method="POST" action="/authorize/grant">
        <input type="hidden" name="client_id" value="${client_id}" />
        <input type="hidden" name="redirect_uri" value="${redirect_uri}" />
        <input type="hidden" name="code_challenge" value="${code_challenge}" />
        <button type="submit">Grant Access</button>
      </form>
    </body>
    </html>
  `);
});

// Handle the OAuth consent form submission
app.post('/authorize/grant', (req, res) => {
  const { client_id, redirect_uri } = req.body;
  
  // Generate a valid authorization code
  const code = 'valid_auth_code_123';
  
  // Redirect the user back to the client's redirect URI with the code
  const redirectUrl = new URL(redirect_uri as string);
  redirectUrl.searchParams.set('code', code);
  
  console.log('Redirecting to:', redirectUrl.toString());
  res.redirect(redirectUrl.toString());
});

// OAuth authorization server metadata
app.get('/.well-known/oauth-authorization-server', (req, res) => {
  const port = process.env.PORT || 3333;
  
  res.json({
    issuer: `http://localhost:${port}/`,
    authorization_endpoint: `http://localhost:${port}/authorize`,
    token_endpoint: `http://localhost:${port}/token`,
    registration_endpoint: `http://localhost:${port}/register`,
    response_types_supported: ['code'],
    code_challenge_methods_supported: ['S256'],
    grant_types_supported: ['authorization_code', 'refresh_token']
  });
});

// Client registration endpoint
app.post('/register', (req, res) => {
  const { client_name, redirect_uris } = req.body;
  
  console.log('Client registration request:');
  console.log(req.body);
  
  if (!client_name || !redirect_uris || !Array.isArray(redirect_uris) || redirect_uris.length === 0) {
    console.log('Invalid client metadata');
    return res.status(400).json({ error: 'invalid_client_metadata' });
  }
  
  const clientId = `client_${uuidv4().substring(0, 8)}`;
  const clientSecret = uuidv4();
  
  console.log(`Registered client: ${clientId}`);
  
  res.status(201).json({
    client_id: clientId,
    client_secret: clientSecret,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_secret_expires_at: 0, // Never expires
    client_name,
    redirect_uris
  });
});

// SSE endpoint
app.get('/sse', authenticateToken, (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  console.log(`\nSSE connection established with token: ${token}`);
  
  // Set up SSE headers - this matches exactly what the test does
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  
  try {
    // Generate a base URL for the message endpoint
    const protocol = req.protocol;
    const host = req.get('host') || 'localhost:3333';
    const baseUrl = `${protocol}://${host}/message`;
    
    // Send the endpoint event - this is exactly what the test expects
    res.write('event: endpoint\n');
    res.write(`data: ${baseUrl}\n\n`);
    
    // Create a transport with our response object
    const transport = new SSEServerTransport('/message', res);
    const sessionId = transport.sessionId;
    
    // Store the transport
    transports.set(sessionId, transport);
    console.log(`Created SSE transport with session ID: ${sessionId}`);
    
    // Connect the server to the transport
    server.connect(transport)
      .then(() => {
        console.log(`Server connected to transport ${sessionId}`);
      })
      .catch(error => {
        console.error(`Error connecting server to transport: ${error}`);
        transports.delete(sessionId);
      });
    
    // Handle client disconnect
    req.on('close', () => {
      console.log(`Client disconnected from session ${sessionId}`);
      transports.delete(sessionId);
    });
  } catch (error) {
    console.error('Error setting up SSE transport:', error);
    // We're not ending the response as headers have already been sent
  }
});

// Message endpoint - match exactly what the SSEServerTransport.handlePostMessage expects
app.post('/message', authenticateToken, async (req, res) => {
  // Get the session ID from the query parameters
  const sessionId = req.query.sessionId as string;
  
  if (!sessionId) {
    console.log('Missing session ID in request');
    return res.status(400).json({
      jsonrpc: '2.0', 
      id: req.body?.id || null,
      error: {
        code: -32000,
        message: 'Missing session ID'
      }
    });
  }
  
  const transport = transports.get(sessionId);
  
  if (!transport) {
    console.log(`No transport found for session ${sessionId}`);
    return res.status(400).json({
      jsonrpc: '2.0',
      id: req.body?.id || null,
      error: {
        code: -32000,
        message: 'No active transport for this session'
      }
    });
  }
  
  console.log(`Handling message for session ${sessionId}`);
  
  try {
    // Use the transport's handlePostMessage method
    await transport.handlePostMessage(req, res);
  } catch (error) {
    console.error(`Error handling message: ${error}`);
    // Don't respond here - let the transport handle it
  }
});

// Start the server
const port = process.env.PORT || 3333;
app.listen(port, () => {
  console.log(`Auth test MCP server running at http://localhost:${port}`);
  console.log(`SSE endpoint: http://localhost:${port}/sse`);
  console.log(`\nFor testing, use these commands:`);
  console.log(`1. To run server: npm run auth-test-server`);
  console.log(`2. To run auth example: npm run auth-example`);
});
