import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';

const app = express();
const PORT = 3333;
const HOST = '0.0.0.0';

// Store active SSE sessions
const activeSessions = new Map();

// Enable extra debugging
const DEBUG = true;
function debug(...args) {
  if (DEBUG) {
    console.log('[DEBUG]', ...args);
  }
}

app.use(cors({ 
  origin: '*', 
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Test-Header']
}));
app.use(express.json());
app.use(express.text({ type: ['text/*', 'application/json'] }));
app.use(express.urlencoded({ extended: true }));

// Define one simple tool
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
  }
];

// Root endpoint
app.get('/', (req, res) => {
  res.send('MCP Dual-Channel Server Running');
});

// Session handler
class SessionHandler {
  req;
  res;
  id;
  isActive = true;
  messageCount = 0;

  constructor(req, res) {
    this.req = req;
    this.res = res;
    this.id = uuidv4();
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    // Set up close handler
    req.on('close', () => {
      debug(`Client closed connection for session ${this.id}`);
      this.close('client disconnected');
    });
    
    req.on('error', (error) => {
      console.error(`Error in session ${this.id}:`, error);
      this.close('error');
    });
  }
  
  // Send a message through SSE
  send(data) {
    if (!this.isActive) {
      debug(`Attempted to send message to inactive session ${this.id}`);
      return;
    }
    
    try {
      const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
      // Truncate log output for large messages
      const logOutput = dataStr.length > 100 ? dataStr.substring(0, 100) + '...' : dataStr;
      console.log(`Sending SSE message to ${this.id}:`, logOutput);
      
      // Write the data with proper format
      this.res.write(`data: ${dataStr}\n\n`);
      
      // Try to flush if available
      if (typeof this.res.flush === 'function') {
        this.res.flush();
      }
      
      this.messageCount++;
    } catch (error) {
      console.error(`Error sending message to ${this.id}:`, error);
      this.close('send error');
    }
  }
  
  // Close the session
  close(reason = 'unknown') {
    if (!this.isActive) return;
    
    console.log(`Closing session ${this.id} - Reason: ${reason}`);
    this.isActive = false;
    
    try {
      this.res.end();
    } catch (error) {
      console.error(`Error closing session ${this.id}:`, error);
    }
    
    activeSessions.delete(this.id);
  }
  
  // Handle a POST message
  async handlePostMessage(req, res) {
    try {
      const body = req.body;
      console.log(`Received message for session ${this.id}:`, typeof body === 'string' ? body : JSON.stringify(body));
      
      const message = typeof body === 'string' ? JSON.parse(body) : body;
      
      // Process the message
      const responseObj = await this.processMessage(message);
      
      // Log request and response for debugging
      debug(`[${this.id}] Request:`, JSON.stringify(message));
      debug(`[${this.id}] Response:`, JSON.stringify(responseObj));
      
      // If it has an ID, it's a request (not a notification)
      if (message.id !== undefined) {
        // Send response via SSE only
        console.log(`Sending SSE response for session ${this.id}`);
        this.send(responseObj);
        
        // Just acknowledge receipt via HTTP
        res.status(200).json({ success: true });
      } else {
        // For notifications, just acknowledge via HTTP
        res.status(200).json({ success: true });
      }
      
    } catch (error) {
      console.error(`Error handling message for session ${this.id}:`, error);
      const errorResponse = {
        jsonrpc: '2.0',
        id: req.body?.id || null,
        error: { code: -32603, message: `Error: ${error.message}` }
      };
      
      res.status(500).json(errorResponse);
      this.send(errorResponse);
    }
  }
  
  // Process MCP message
  async processMessage(message) {
    debug(`Processing message for session ${this.id}:`, message.method);
    
    // Handle notifications (no id)
    if (message.id === undefined) {
      // Just acknowledge and return early
      debug(`Received notification: ${message.method}`);
      return { success: true };
    }
    
    if (message.method === "initialize") {
      console.log(`Handle initialize for session ${this.id}`);
      
      // Use the same protocol version the client sends
      const clientProtocolVersion = message.params?.protocolVersion || "2024-11-05";
      console.log(`Using client-requested protocol version: ${clientProtocolVersion}`);
      
      return {
        jsonrpc: "2.0",
        id: message.id,
        result: {
          protocolVersion: clientProtocolVersion,
          capabilities: { tools: { listChanged: true } },
          serverInfo: { name: "MCP Dual Channel Server", version: "1.0.0" },
          tools: TOOLS
        }
      };
    } 
    else if (message.method === "tools/list") {
      console.log(`Handle tools/list for session ${this.id}`);
      
      return {
        jsonrpc: "2.0",
        id: message.id,
        result: TOOLS
      };
    }
    else if (message.method === "tools/execute" || message.method === "tools/call") {
      console.log(`Handle tool call for session ${this.id}`);
      
      const params = message.params;
      const name = params.name;
      const toolParams = params.arguments || params.params;
      
      if (name === "echo") {
        console.log(`Echo tool invoked with: "${toolParams.message}"`);
        
        return {
          jsonrpc: "2.0",
          id: message.id,
          result: {
            content: [
              { type: "text", text: toolParams.message }
            ]
          }
        };
      }
      else {
        return {
          jsonrpc: "2.0",
          id: message.id,
          error: { code: -32601, message: `Tool not found: ${name}` }
        };
      }
    }
    else {
      return {
        jsonrpc: "2.0",
        id: message.id,
        error: { code: -32601, message: `Method not found: ${message.method}` }
      };
    }
  }
}

// Auth middleware
function authenticate(req, res, next) {
  debug('Authenticating request...');
  
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    console.log('Missing authorization header');
    return res.status(401).json({
      error: {
        code: 'missing_token',
        message: 'Authorization header is required'
      }
    });
  }
  
  if (!authHeader.startsWith('Bearer ')) {
    console.log('Invalid authorization format');
    return res.status(401).json({
      error: {
        code: 'invalid_token_format',
        message: 'Authorization header must use Bearer scheme'
      }
    });
  }
  
  const token = authHeader.substring(7);
  if (!token.startsWith('test_token_')) {
    console.log('Invalid token value');
    return res.status(401).json({
      error: {
        code: 'invalid_token',
        message: 'Token is invalid or expired'
      }
    });
  }
  
  debug('Valid test token:', authHeader);
  return next();
}

// Basic token endpoint
app.post('/token', (req, res) => {
  console.log('Token request:', req.body);
  
  const clientId = req.body.client_id || 'test_client_id';
  
  const tokens = {
    access_token: `test_token_${clientId}`,
    token_type: 'Bearer',
    expires_in: 3600,
    refresh_token: `refresh_token_${clientId}`
  };
  
  console.log('Issuing tokens for client:', clientId);
  res.json(tokens);
});

// SSE endpoint
app.get('/sse', authenticate, (req, res) => {
  console.log('SSE connection from:', req.headers['user-agent']);
  
  const session = new SessionHandler(req, res);
  activeSessions.set(session.id, session);
  
  console.log(`Session created: ${session.id}`);
  
  // Send endpoint URL - CRITICAL - This exact format is required
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const endpointUrl = `${baseUrl}/sse/${session.id}`;
  
  console.log(`Sending endpoint URL: ${endpointUrl}`);
  res.write("event: endpoint\n");
  res.write(`data: ${endpointUrl}\n\n`);
  
  if (typeof res.flush === 'function') {
    res.flush();
  }
  
  // Send session status (but don't close the session)
  session.send({ sessionId: session.id, status: "connected" });
});

// Handle messages
app.post('/sse/:sessionId', authenticate, async (req, res) => {
  const { sessionId } = req.params;
  
  debug(`Received message for session: ${sessionId}`);
  debug('Headers:', req.headers);
  debug('Body:', typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
  
  const session = activeSessions.get(sessionId);
  
  if (!session) {
    console.log(`Session not found: ${sessionId}`);
    return res.status(404).json({
      jsonrpc: '2.0',
      id: req.body?.id || null,
      error: { code: -32001, message: 'Session not found' }
    });
  }
  
  await session.handlePostMessage(req, res);
});

// CORS preflight
app.options('*', cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Test-Header']
}));

// Start server
const server = app.listen(PORT, HOST, () => {
  console.log(`MCP Dual-Channel Server running at http://${HOST}:${PORT}`);
  console.log(`For local testing, use: http://127.0.0.1:${PORT}`);
});

// Handle shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  
  for (const [sessionId, session] of activeSessions.entries()) {
    session.close('server shutdown');
  }
  
  server.close(() => {
    console.log('Server stopped');
    process.exit(0);
  });
});