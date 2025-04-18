import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { URL } from 'url';

const app = express();
const PORT = 3333;
const HOST = '0.0.0.0'; // Listen on all interfaces

// Store active SSE sessions
const activeSessions = new Map();

// Store registered clients
const clients = new Map();

app.use(cors({
  origin: '*', // Allow all origins for testing
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Test-Header']
}));

// Support for different content types
app.use(express.json());
app.use(express.text({ type: ['text/*', 'application/json'] }));
app.use(express.urlencoded({ extended: true }));

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

// Session handler class
class SessionHandler {
  req;
  res;
  id;
  isActive = true;
  lastPingTime;
  heartbeatInterval;

  constructor(req, res) {
    this.req = req;
    this.res = res;
    this.id = uuidv4();
    this.lastPingTime = Date.now();
    
    // Set up headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    // Set up heartbeat - much more frequent for testing
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, 5000); // Every 5 seconds
    
    // Set up close handler
    req.on('close', () => {
      this.close();
    });
    
    req.on('error', (error) => {
      console.error(`Error in session ${this.id}:`, error);
      this.close();
    });
  }
  
  // Send a message through SSE
  send(data) {
    if (!this.isActive) return;
    
    try {
      const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
      console.log(`Sending SSE message to ${this.id}:`, dataStr);
      this.res.write(`data: ${dataStr}\n\n`);
      
      // Try to flush if available
      if (typeof this.res.flush === 'function') {
        this.res.flush();
      }
      
      this.lastPingTime = Date.now();
    } catch (error) {
      console.error(`Error sending message to session ${this.id}:`, error);
      this.close();
    }
  }
  
  // Send a heartbeat
  sendHeartbeat() {
    if (!this.isActive) return;
    
    try {
      console.log(`Sending heartbeat to session ${this.id}`);
      this.res.write(`: heartbeat ${new Date().toISOString()}\n\n`);
      
      if (typeof this.res.flush === 'function') {
        this.res.flush();
      }
    } catch (error) {
      console.error(`Error sending heartbeat to session ${this.id}:`, error);
      this.close();
    }
  }
  
  // Close the session
  close() {
    if (!this.isActive) return;
    
    console.log(`Closing session ${this.id}`);
    this.isActive = false;
    clearInterval(this.heartbeatInterval);
    
    try {
      this.res.end();
    } catch (error) {
      console.error(`Error closing session ${this.id}:`, error);
    }
    
    activeSessions.delete(this.id);
    console.log(`Session ${this.id} closed`);
  }
  
  // Handle a POST message
  async handlePostMessage(req, res) {
    try {
      const body = req.body;
      console.log(`Processing message for session ${this.id}:`, typeof body === 'string' ? body : JSON.stringify(body));
      
      const message = typeof body === 'string' ? JSON.parse(body) : body;
      
      // Process the message
      await this.processMessage(message);
      
      // Always send an HTTP response
      res.status(200).json({
        jsonrpc: '2.0',
        id: message.id,
        result: { success: true }
      });
    } catch (error) {
      console.error(`Error handling POST message: ${error.message}`);
      res.status(500).json({
        jsonrpc: '2.0',
        id: req.body.id || null,
        error: {
          code: -32603,
          message: `Internal error: ${error.message}`
        }
      });
    }
  }
  
  // Process MCP message
  async processMessage(message) {
    console.log(`Processing message for session ${this.id}:`, message);
    
    // Check if this is a notification (no id field)
    const isNotification = message.jsonrpc === "2.0" && message.method && message.id === undefined;
    
    if (message.method === "initialize") {
      console.log(`Handling initialize request with ID: ${message.id}`);
      
      // Respond with proper MCP initialize response
      const response = {
        jsonrpc: "2.0",
        id: message.id,
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
      
      console.log(`Sending initialize response:`, JSON.stringify(response));
      this.send(response);
    } 
    else if (message.method === "tools/list") {
      console.log(`Handling tools/list request with ID: ${message.id}`);
      
      // Respond with list of tools
      const response = {
        jsonrpc: "2.0",
        id: message.id,
        result: TOOLS
      };
      
      console.log(`Sending tools/list response:`, JSON.stringify(response));
      this.send(response);
    }
    else if (message.method === "tools/execute") {
      console.log(`Handling tools/execute request with ID: ${message.id}`);
      
      // Extract tool name and parameters
      const { name, params } = message.params;
      
      if (name === "echo") {
        // Process echo tool
        console.log(`Executing echo tool with parameters:`, params);
        
        const response = {
          jsonrpc: "2.0",
          id: message.id,
          result: {
            content: [
              {
                type: "text",
                text: params.message
              }
            ]
          }
        };
        
        console.log(`Sending echo tool response:`, JSON.stringify(response));
        this.send(response);
      }
      else if (name === "getServerInfo") {
        // Process getServerInfo tool
        console.log(`Executing getServerInfo tool`);
        
        const response = {
          jsonrpc: "2.0",
          id: message.id,
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
        
        console.log(`Sending getServerInfo tool response:`, JSON.stringify(response));
        this.send(response);
      }
      else {
        // Unknown tool
        console.log(`Unknown tool: ${name}`);
        
        const response = {
          jsonrpc: "2.0",
          id: message.id,
          error: {
            code: -32601,
            message: `Tool not found: ${name}`
          }
        };
        
        this.send(response);
      }
    }
    else if (message.method === "resources/list" || message.method === "prompts/list") {
      // Return empty lists for resources and prompts
      console.log(`Handling ${message.method} request with ID:`, message.id);
      
      const response = {
        jsonrpc: "2.0",
        id: message.id,
        result: []
      };
      
      console.log(`Sending ${message.method} response:`, JSON.stringify(response));
      this.send(response);
    }
    // Handle notification methods - don't need to send a response
    else if (isNotification) {
      console.log(`Handling notification: ${message.method}`);
      // No response needed for notifications
      return;
    }
    else {
      console.log(`Unknown method: ${message.method}`);
      
      // Return error for unknown methods
      const response = {
        jsonrpc: "2.0",
        id: message.id,
        error: {
          code: -32601,
          message: `Method not found: ${message.method}`
        }
      };
      
      this.send(response);
    }
  }
}

// Basic auth middleware
function authenticateRequest(req, res, next) {
  const authHeader = req.headers.authorization;
  console.log('Auth check - Header:', authHeader);

  if (!authHeader) {
    console.log('No token provided');
    return res.status(401).send('Unauthorized');
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
app.get('/sse', authenticateRequest, (req, res) => {
  console.log('SSE connection request received');
  console.log('Headers:', req.headers);
  
  // Create a new session
  const session = new SessionHandler(req, res);
  activeSessions.set(session.id, session);
  
  console.log(`SSE connection established with sessionId: ${session.id}`);
  
  // Send the endpoint URL for the client to use
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const endpointUrl = `${baseUrl}/sse/${session.id}`;
  console.log(`Sending endpoint URL: ${endpointUrl}`);
  
  // Send session ID first
  session.send({
    sessionId: session.id
  });
  
  // Then send endpoint event
  res.write(`event: endpoint\ndata: ${endpointUrl}\n\n`);
});

// Handle SSE messages
app.post('/sse/:sessionId', authenticateRequest, async (req, res) => {
  const { sessionId } = req.params;
  console.log(`Received message for session ${sessionId}`);
  console.log('Headers:', req.headers);
  
  const session = activeSessions.get(sessionId);
  
  if (!session) {
    console.log(`Session ${sessionId} not found`);
    return res.status(404).json({
      jsonrpc: '2.0',
      id: req.body.id || null,
      error: { code: -32001, message: 'Session not found' }
    });
  }
  
  // Let the session handler process the message
  await session.handlePostMessage(req, res);
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  
  res.status(500).json({
    jsonrpc: '2.0',
    id: req.body?.id || null,
    error: {
      code: -32603,
      message: 'Internal server error',
      data: {
        errorMessage: err.message,
        stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined
      }
    }
  });
});

// Start the server
app.listen(PORT, HOST, () => {
  console.log(`Auth test MCP server running at http://${HOST}:${PORT}`);
  console.log(`SSE endpoint: http://${HOST}:${PORT}/sse`);
  console.log(`\nFor local testing, use: http://127.0.0.1:${PORT}`);
  console.log('\nFor testing, use these commands:');
  console.log('1. To run server: npm run auth-test-server');
  console.log('2. To run auth example: npm run auth-example');
});