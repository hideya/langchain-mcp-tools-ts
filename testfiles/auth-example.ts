import { convertMcpToLangchainTools, McpServersConfig } from '../src/langchain-mcp-tools';
import { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import * as crypto from 'crypto';

// Enable more verbose logging for debugging
process.env.MCP_DEBUG = 'true';

// Simple function to generate PKCE code verifier and challenge
function generatePkceChallenge() {
  // For testing, we'll use a fixed code verifier
  const codeVerifier = 'test_code_verifier_123456789012345678901234567890';
  
  // Create a code challenge (normally this would be the base64url of SHA256 hash)
  // For testing, we'll use a simple value
  const codeChallenge = 'test_code_challenge_123456789012345678901234567890';
  
  return {
    code_verifier: codeVerifier,
    code_challenge: codeChallenge
  };
}

// Create a class that implements the OAuthClientProvider interface
class TestOAuthProvider implements OAuthClientProvider {
  private _clientInfo: any = null;
  private _tokens: any = null;
  private _codeVerifier: string = '';
  private _redirectUrl: string;
  private _clientMetadata: any;
  
  constructor(options: { clientMetadata: any; redirectUrl: string }) {
    this._redirectUrl = options.redirectUrl;
    this._clientMetadata = options.clientMetadata;
    
    // Initialize code verifier with a default value
    this._codeVerifier = 'default_code_verifier_for_testing_123456789012345678901234567890';
  }
  
  // Required methods from OAuthClientProvider interface
  async clientInformation() {
    return this._clientInfo;
  }
  
  async saveClientInformation(info: any) {
    console.log('Saving client information:', info);
    this._clientInfo = info;
  }
  
  async tokens() {
    return this._tokens;
  }
  
  async saveTokens(tokens: any) {
    console.log('Saving tokens:', tokens);
    this._tokens = tokens;
    return tokens;
  }
  
  async codeVerifier() {
    return this._codeVerifier;
  }
  
  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    console.log('Saving code verifier:', codeVerifier);
    this._codeVerifier = codeVerifier;
  }
  
  async redirectToAuthorization(url: URL) {
    console.log(`[Authorization needed] User would be redirected to: ${url.toString()}`);
    
    // For automated testing, we'll simulate the authorization flow
    console.log('Simulating user authorization...');
    
    // Extract client_id and other query parameters
    const clientId = url.searchParams.get('client_id');
    const codeChallenge = url.searchParams.get('code_challenge');
    const redirectUri = url.searchParams.get('redirect_uri');
    
    console.log('Client ID:', clientId);
    console.log('Code Challenge:', codeChallenge);
    console.log('Redirect URI:', redirectUri);
    
    // Simulate authorization code
    const authCode = 'valid_auth_code_123';
    console.log('Simulated authorization code:', authCode);
    
    // In a real implementation, this would throw or redirect.
    // For testing, let's throw with the auth code for simulating the flow
    throw new Error('Authorization required');
  }
  
  // Helper property getters
  get redirectUrl() {
    return this._redirectUrl;
  }
  
  get clientMetadata() {
    return this._clientMetadata;
  }
}

// Debug helper to log all messages exchanged with the server
const logAllMessages = (enabled = true) => {
  if (enabled) {
    const originalFetch = global.fetch;
    global.fetch = async function(...args: Parameters<typeof fetch>) {
      console.log('MCP fetch request:', args[0], args[1]?.method);
      if (args[1]?.body && typeof args[1].body === 'string') {
        try {
          const body = JSON.parse(args[1].body);
          console.log('Request body:', body);
        } catch (e) {
          console.log('Request body (raw):', args[1].body);
        }
      }
      
      const response = await originalFetch(...args);
      
      // Clone the response to read it without consuming it
      const clonedResponse = response.clone();
      try {
        const text = await clonedResponse.text();
        console.log('Response:', text);
      } catch (e) {
        console.log('Could not read response');
      }
      
      return response;
    };

    // Also monkey patch EventSource to debug SSE messages
    const originalEventSource = global.EventSource;
    // @ts-ignore
    global.EventSource = function(url, options) {
      console.log('Creating EventSource connection to:', url);
      console.log('EventSource options:', options);
      
      // @ts-ignore
      const eventSource = new originalEventSource(url, options);
      
      const originalAddEventListener = eventSource.addEventListener;
      eventSource.addEventListener = function(type, listener, options) {
        console.log(`Adding event listener for: ${type}`);
        
        // Wrap the listener to log events
        const wrappedListener = function(event) {
          console.log(`SSE event received: ${type}`, event?.data ? event.data : '(no data)');
          // @ts-ignore
          listener(event);
        };
        
        // @ts-ignore
        return originalAddEventListener.call(this, type, wrappedListener, options);
      };
      
      return eventSource;
    };
  }
};

// Connect with authentication
const connectWithAuth = async (authProvider) => {
  console.log('Connecting with auth token...');
  
  try {
    // Add debug timeout to see if connection is hanging
    const connectPromise = convertMcpToLangchainTools({
      secureServer: {
        url: 'http://127.0.0.1:3333/sse',
        sseOptions: {
          authProvider: authProvider,
          requestInit: {
            headers: {
              'X-Test-Header': 'test-value'
            }
          }
        },
      }
    });
    
    // Set a timeout to see if we're hanging
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('Connection timed out - check server logs for details'));
      }, 10000); // 10 second timeout
    });
    
    // Race the connection against the timeout
    const result = await Promise.race([connectPromise, timeoutPromise]);
    const { tools, cleanup } = result as any;
    
    console.log('Connection successful! Available tools:', 
      tools.map(t => t.name).join(', '));
    
    // Try using a tool if any are available
    if (tools.length > 0) {
      const echoTool = tools.find(t => t.name === 'echo');
      if (echoTool) {
        console.log('Testing echo tool...');
        const result = await echoTool.invoke({ message: 'Hello, authenticated MCP!' });
        console.log('Echo result:', result);
      }
    }
    
    return { tools, cleanup };
  } catch (error) {
    console.error('Connection failed:', error);
    
    // More detailed error information for debugging
    if (error.details) {
      console.error('Detailed error:', error.details);
      
      // Check for specific error types
      if (error.details.code === -32001) {
        console.error('Timeout error - the server might not be responding to all required messages');
        console.error('Check that your server implements all necessary MCP protocol methods');
      }
    }
    
    throw error;
  }
};

async function main() {
  console.log('Initializing secure MCP tools...');
  
  // Enable message logging
  logAllMessages();

  // Define the server base URL - use a specific IPv4 address
  const SERVER_URL = 'http://127.0.0.1:3333';
  
  // Check if server is running
  try {
    console.log(`Checking if server is available at ${SERVER_URL}...`);
    const response = await fetch(SERVER_URL);
    console.log(`Server responded with status: ${response.status}`);
  } catch (error) {
    console.error(`Error connecting to server: ${error.message}`);
    console.error('Please make sure the server is running at', SERVER_URL);
    return;
  }

  // Create our OAuth provider
  const authProvider = new TestOAuthProvider({
    clientMetadata: {
      client_name: 'MCP LangChain Tools Example',
      redirect_uris: ['http://localhost:3000/callback']
    },
    redirectUrl: 'http://localhost:3000/callback'
  });

  try {
    console.log('\nStarting manual authentication flow');
    
    // Step 1: Register the client and get client info
    console.log('Registering client...');
    const registerUrl = `${SERVER_URL}/register`;
    const registerResponse = await fetch(registerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(authProvider.clientMetadata)
    });
    
    if (!registerResponse.ok) {
      throw new Error(`Client registration failed: ${registerResponse.status}`);
    }
    
    const clientInfo = await registerResponse.json();
    await authProvider.saveClientInformation(clientInfo);
    
    console.log('Client information received:');
    console.log(`- Client ID: ${clientInfo.client_id}`);
    console.log(`- Client Secret: ${clientInfo.client_secret ? '[PRESENT]' : '[MISSING]'}`);
    
    // Step 2: Generate code verifier for PKCE
    console.log('Generating code verifier...');
    // Use our simple implementation instead of the library
    const challenge = generatePkceChallenge();
    const codeVerifier = challenge.code_verifier;
    const codeChallenge = challenge.code_challenge;
    
    await authProvider.saveCodeVerifier(codeVerifier);
    console.log(`Code verifier generated: ${codeVerifier.substring(0, 10)}...`);
    console.log(`Code challenge generated: ${codeChallenge}`);
    
    // Step 3: Simulate authorization
    console.log('\nSimulating authorization...');
    const authCode = 'valid_auth_code_123';
    console.log(`Using authorization code: ${authCode}`);
    
    // Step 4: Exchange code for tokens
    console.log('\nExchanging code for tokens...');
    const tokenUrl = `${SERVER_URL}/token`;
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientInfo.client_id,
      code: authCode,
      code_verifier: codeVerifier
    });
    
    if (clientInfo.client_secret) {
      params.set('client_secret', clientInfo.client_secret);
    }
    
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });
    
    if (!tokenResponse.ok) {
      throw new Error(`Token exchange failed: HTTP ${tokenResponse.status}`);
    }
    
    const tokens = await tokenResponse.json();
    await authProvider.saveTokens(tokens);
    
    console.log('Tokens received:');
    console.log(`- Access token: ${tokens.access_token.substring(0, 10)}...`);
    console.log(`- Expires in: ${tokens.expires_in} seconds`);
    if (tokens.refresh_token) {
      console.log(`- Refresh token: ${tokens.refresh_token.substring(0, 10)}...`);
    }
    
    console.log('\nAuthentication completed!');
    
    // Now try to connect with the auth token
    console.log('\nConnecting with auth token...');
    
    // Add a delay to ensure the server is ready
    await new Promise(resolve => setTimeout(resolve, 500));
    
    try {
      const { tools, cleanup } = await connectWithAuth(authProvider);
      
      console.log(`\nConnection successful with ${tools.length} tools available.`);
      
      // Clean up when done
      await cleanup();
      console.log('Connection cleaned up.');
    } catch (error) {
      console.error('Failed to connect with auth token:', error);
    }
    
  } catch (error) {
    console.error('Error during authentication or retry:', error);
    console.error(error.stack);
  }
}

main();