import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { URL } from 'url';

const app = express();
const PORT = 3333;
const HOST = '0.0.0.0'; // Listen on all interfaces

app.use(cors({
  origin: '*', // Allow all origins for testing
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Test-Header']
}));

// Support for different content types
app.use(express.json());
app.use(express.text({ type: ['text/*', 'application/json'] }));
app.use(express.urlencoded({ extended: true }));

// Store active SSE sessions
const sessions = new Map();

// Store registered clients
const clients = new Map();

// Define our tools
const TOOLS = [
  {
    name: "echo",
    description: "Echo back the input",
    inputSchema: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "Message to echo back"
        }
      },
      required: ["message"]
    }
  },
  {
    name: "getServerInfo",
    description: "Get server information",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    }
  }
];

// Root endpoint for health checks
app.get('/', (req, res) => {
  res.send('MCP Auth Test Server is running');
});

// Basic auth middleware
function checkAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  console.log('Auth check - Header:', authHeader);

  if (!authHeader) {
    console.log('No token provided');
    return next();
  }

  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    
    // Check if it's our test token
    if (token.startsWith('test_token_client_')) {
      console.log('Accept test token for development');
      return next();
    }
  }

  res.status(401).json({ error: 'Unauthorized' });
}

// Client registration endpoint
app.post('/register', (req, res) => {
  console.log('Registration request received');
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  
  const clientData = req.body;
  console.log('Client registration request:');
  console.log(clientData);

  // Generate a simple client ID
  const clientId = `client_${Math.random().toString(16).substring(2, 10)}`;
  const clientSecret = uuidv4();

  const clientInfo = {
    client_id: clientId,
    client_secret: clientSecret,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_secret_expires_at: 0,
    ...clientData
  };

  clients.set(clientId, clientInfo);
  console.log(`Registered client: ${clientId}`);

  res.json(clientInfo);
});

// OAuth authorization endpoint (simplified for testing)
app.get('/authorize', (req, res) => {
  const { client_id, redirect_uri, code_challenge } = req.query;
  console.log('Authorization request received:');
  console.log('- client_id:', client_id);
  console.log('- redirect_uri:', redirect_uri);
  console.log('- code_challenge:', code_challenge);
  
  // For testing, just redirect with a test code
  const redirectUrl = new URL(redirect_uri as string);
  redirectUrl.searchParams.append('code', 'valid_auth_code_123');
  
  console.log('Redirecting to:', redirectUrl.toString());
  res.redirect(redirectUrl.toString());
});

// OAuth token endpoint
app.post('/token', (req, res) => {
  const { grant_type, client_id, code, code_verifier } = req.body;
  console.log('Token request received:');
  console.log('- grant_type:', grant_type);
  console.log('- client_id:', client_id);
  console.log('- code:', code);
  console.log('- code_verifier:', code_verifier);
  
  // For testing, always return tokens
  const tokens = {
    access_token: `test_token_${client_id}`,
    token_type: 'Bearer',
    expires_in: 3600,
    refresh_token: `refresh_test_token_${client_id}`
  };
  
  console.log('Returning tokens:', tokens);
  res.json(tokens);
});

// SSE endpoint with auth
app.get('/sse', checkAuth, (req, res) => {
  console.log('SSE connection request received');
  console.log('Headers:', req.headers);
  
  if (!req.headers.authorization) {
    console.log('Unauthorized SSE request - no auth header');
    return res.status(401).send('Unauthorized');
  }

  // Set up SSE connection
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // Create a unique session ID
  const sessionId = uuidv4();
  
  // Store the session
  sessions.set(sessionId, { req, res, lastPingTime: Date.now() });
  
  console.log(`SSE connection established with sessionId: ${sessionId}`);
  
  // Send the session ID to the client
  res.write(`data: ${JSON.stringify({ sessionId })}\n\n`);
  
  // Also send the endpoint URL
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const endpointUrl = `${baseUrl}/sse/${sessionId}`;
  console.log(`Sending endpoint URL: ${endpointUrl}`);
  res.write(`event: endpoint\ndata: ${endpointUrl}\n\n`);
  
  // Handle client disconnection
  req.on('close', () => {
    console.log(`Client disconnected, removing session ${sessionId}`);
    sessions.delete(sessionId);
  });
});

// Handle SSE messages
app.post('/sse/:sessionId', checkAuth, (req, res) => {
  const { sessionId } = req.params;
  const message = req.body;
  
  console.log(`Received message for session ${sessionId}:`, message);
  console.log('Headers:', req.headers);
  console.log('Content-Type:', req.headers['content-type']);
  
  if (sessions.has(sessionId)) {
    try {
      handleSSEMessage(sessionId, typeof message === 'string' ? message : JSON.stringify(message));
      res.sendStatus(200);
    } catch (error) {
      console.error(`Error handling message: ${error.message}`);
      res.status(500).send(`Error handling message: ${error.message}`);
    }
  } else {
    console.log(`Session ${sessionId} not found`);
    res.status(404).send('Session not found');
  }
});

// Function to handle SSE messages
function handleSSEMessage(sessionId, message) {
  console.log(`Processing message for session ${sessionId}:`, message);
  
  try {
    const parsed = JSON.parse(message);
    console.log(`Parsed message:`, parsed);
    
    // Check if this is a notification (no id field)
    const isNotification = parsed.jsonrpc === "2.0" && parsed.method && parsed.id === undefined;
    
    if (parsed.method === "initialize") {
      console.log("Handling initialize request with ID:", parsed.id);
      
      // Respond with proper MCP initialize response
      const response = {
        jsonrpc: "2.0",
        id: parsed.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: { listChanged: true },
            resources: { listChanged: true, subscribe: true },
            prompts: { listChanged: true },
            logging: { enabled: true }
          },
          serverInfo: {
            name: "MCP SSE Auth Test Server",
            version: "1.0.0"
          },
          tools: TOOLS
        }
      };
      
      console.log("Sending initialize response:", JSON.stringify(response));
      sendSSEMessage(sessionId, JSON.stringify(response));
    } 
    else if (parsed.method === "tools/list") {
      console.log("Handling tools/list request with ID:", parsed.id);
      
      // Respond with list of tools
      const response = {
        jsonrpc: "2.0",
        id: parsed.id,
        result: TOOLS
      };
      
      console.log("Sending tools/list response:", JSON.stringify(response));
      sendSSEMessage(sessionId, JSON.stringify(response));
    }
    else if (parsed.method === "tools/call") {
      console.log("Handling tools/call request with ID:", parsed.id);
      
      // Extract tool name and parameters
      const { name, parameters } = parsed.params;
      
      if (name === "echo") {
        // Process echo tool
        console.log("Executing echo tool with parameters:", parameters);
        
        const response = {
          jsonrpc: "2.0",
          id: parsed.id,
          result: {
            content: [
              {
                type: "text",
                text: parameters.message
              }
            ]
          }
        };
        
        console.log("Sending echo tool response:", JSON.stringify(response));
        sendSSEMessage(sessionId, JSON.stringify(response));
      }
      else if (name === "getServerInfo") {
        // Process getServerInfo tool
        console.log("Executing getServerInfo tool");
        
        const response = {
          jsonrpc: "2.0",
          id: parsed.id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  name: "MCP SSE Auth Test Server",
                  version: "1.0.0",
                  uptime: process.uptime(),
                  time: new Date().toISOString()
                })
              }
            ]
          }
        };
        
        console.log("Sending getServerInfo tool response:", JSON.stringify(response));
        sendSSEMessage(sessionId, JSON.stringify(response));
      }
      else {
        // Unknown tool
        console.log(`Unknown tool: ${name}`);
        
        const response = {
          jsonrpc: "2.0",
          id: parsed.id,
          error: {
            code: -32601,
            message: `Tool not found: ${name}`
          }
        };
        
        sendSSEMessage(sessionId, JSON.stringify(response));
      }
    }
    else if (parsed.method === "resources/list" || parsed.method === "prompts/list") {
      // Return empty lists for resources and prompts
      console.log(`Handling ${parsed.method} request with ID:`, parsed.id);
      
      const response = {
        jsonrpc: "2.0",
        id: parsed.id,
        result: []
      };
      
      console.log(`Sending ${parsed.method} response:`, JSON.stringify(response));
      sendSSEMessage(sessionId, JSON.stringify(response));
    }
    else if (parsed.method === "echo") {
      console.log("Handling echo request with ID:", parsed.id);
      
      // Simple echo method implementation
      const response = {
        jsonrpc: "2.0",
        id: parsed.id,
        result: parsed.params.message // Just return the message parameter
      };
      
      sendSSEMessage(sessionId, JSON.stringify(response));
    }
    else if (parsed.method === "getServerInfo") {
      console.log("Handling getServerInfo request with ID:", parsed.id);
      
      // Simple server info implementation
      const response = {
        jsonrpc: "2.0",
        id: parsed.id,
        result: {
          name: "MCP SSE Auth Test Server",
          version: "1.0.0",
          uptime: process.uptime()
        }
      };
      
      sendSSEMessage(sessionId, JSON.stringify(response));
    }
    // Handle notification methods - don't need to send a response
    else if (isNotification) {
      console.log(`Handling notification: ${parsed.method}`);
      // No response needed for notifications
      return;
    }
    else {
      console.log(`Unknown method: ${parsed.method}`);
      
      // Return error for unknown methods
      const response = {
        jsonrpc: "2.0",
        id: parsed.id,
        error: {
          code: -32601,
          message: `Method not found: ${parsed.method}`
        }
      };
      
      sendSSEMessage(sessionId, JSON.stringify(response));
    }
  } catch (error) {
    console.error(`Error handling message: ${error.message}`);
    
    try {
      const parsed = JSON.parse(message);
      // Send error response
      const errorResponse = {
        jsonrpc: "2.0",
        id: parsed.id || null,
        error: {
          code: -32000,
          message: `Internal error: ${error.message}`
        }
      };
      
      sendSSEMessage(sessionId, JSON.stringify(errorResponse));
    } catch (parseError) {
      console.error("Could not parse message to send error response");
    }
    
    throw error; // Re-throw for the route handler to catch
  }
}

// Function to send SSE messages
function sendSSEMessage(sessionId, data) {
  const session = sessions.get(sessionId);
  if (session) {
    try {
      // Format the data as an SSE event with proper formatting
      console.log(`Sending SSE message to ${sessionId}: ${data}`);
      session.res.write(`data: ${data}\n\n`);
      
      // Try to flush the data if the method exists
      if (typeof session.res.flush === 'function') {
        session.res.flush();
      }
      
      // Update ping time
      session.lastPingTime = Date.now();
    } catch (error) {
      console.error(`Error sending SSE message: ${error.message}`);
      // Remove the session if we can't send to it
      sessions.delete(sessionId);
      throw error;
    }
  } else {
    console.error(`Session ${sessionId} not found when trying to send message`);
    throw new Error(`Session ${sessionId} not found`);
  }
}

// Ping function to keep connections alive
function pingAllSessions() {
  console.log(`Pinging ${sessions.size} active sessions`);
  
  for (const [sessionId, session] of sessions.entries()) {
    try {
      // Send a ping every 30 seconds
      if (Date.now() - session.lastPingTime > 30000) {
        session.res.write(`: ping ${new Date().toISOString()}\n\n`);
        if (typeof session.res.flush === 'function') {
          session.res.flush();
        }
        session.lastPingTime = Date.now();
      }
    } catch (error) {
      console.error(`Error pinging session ${sessionId}: ${error.message}`);
      sessions.delete(sessionId);
    }
  }
}

// Set up ping interval for keepalive
setInterval(pingAllSessions, 15000);

// Start the server
app.listen(PORT, HOST, () => {
  console.log(`Auth test MCP server running at http://${HOST}:${PORT}`);
  console.log(`SSE endpoint: http://${HOST}:${PORT}/sse`);
  console.log(`\nFor local testing, use: http://127.0.0.1:${PORT}`);
  console.log('\nFor testing, use these commands:');
  console.log('1. To run server: npm run auth-test-server');
  console.log('2. To run auth example: npm run auth-example');
});