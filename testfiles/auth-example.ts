import { convertMcpToLangchainTools, McpServersConfig } from '../src/langchain-mcp-tools';
import { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';

// Enable more verbose logging for debugging
process.env.MCP_DEBUG = 'true';

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
    this._clientInfo = info;
  }

  async tokens() {
    return this._tokens;
  }

  async saveTokens(tokens: any) {
    this._tokens = tokens;
    return tokens;
  }

  async codeVerifier() {
    return this._codeVerifier;
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    this._codeVerifier = codeVerifier;
  }

  async redirectToAuthorization(url: URL) {
    console.log(`[Authorization needed] User would be redirected to: ${url.toString()}`);
    throw new Error('Authorization required');
  }

  // Helper methods for our test implementation
  get redirectUrl() {
    return this._redirectUrl;
  }

  get clientMetadata() {
    return this._clientMetadata;
  }

  // Manual code verifier and challenge generation
  generateCodeVerifier() {
    try {
      console.log('Generating code verifier...');
      // Generate a random string for code verifier (PKCE)
      const randomBytes = new Uint8Array(32);
      crypto.getRandomValues(randomBytes);
      const verifier = btoa(String.fromCharCode(...randomBytes))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
      
      this._codeVerifier = verifier;
      return this._codeVerifier;
    } catch (error) {
      console.error('Error generating code verifier:', error);
      // Use default code verifier if generation fails
      return this._codeVerifier;
    }
  }

  // Generate a code challenge for PKCE
  async generateCodeChallenge(verifier: string) {
    try {
      console.log('Generating code challenge for verifier...');
      const encoder = new TextEncoder();
      const data = encoder.encode(verifier);
      const digest = await crypto.subtle.digest('SHA-256', data);
      
      // Convert to base64url format
      return btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    } catch (error) {
      console.error('Error generating code challenge:', error);
      // Simple fallback
      return 'fallback_code_challenge';
    }
  }

  // Request client information from the server
  async requestClientInfo(registerUrl: string) {
    console.log(`Requesting client info from: ${registerUrl}`);
    try {
      const response = await fetch(registerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(this._clientMetadata)
      });

      if (!response.ok) {
        throw new Error(`Client registration failed: ${response.status}`);
      }

      const clientInfo = await response.json();
      this._clientInfo = clientInfo;
      return clientInfo;
    } catch (error) {
      console.error(`Error requesting client info: ${error.message}`);
      throw error;
    }
  }

  // Set tokens directly (for testing)
  async setTokens(tokens: any) {
    return this.saveTokens(tokens);
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
  }
};

// Connect with authentication
const connectWithAuth = async (authProvider) => {
  console.log('Connecting with auth token...');
  
  try {
    const tools = await convertMcpToLangchainTools({
      secureServer: {
        url: 'http://127.0.0.1:3333/sse',
        sseOptions: {
          authProvider: authProvider
        },
      }
    });
    
    console.log('Connection successful!', tools); 

    console.log('Connection successful! Available tools:', 
      Object.keys(tools).join(', '));
    
    return tools;
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

  const mcpSseServerWithAuth: McpServersConfig = {
    secureServer: {
      url: `${SERVER_URL}/sse`,
      sseOptions: {
        authProvider,
        requestInit: {
          headers: {
            'X-Test-Header': 'test-value'
          }
        }
      },
    },
  };

  try {
    // First connection attempt will fail because we need to authenticate
    console.log('Attempting initial connection (expected to fail)...');
    try {
      await convertMcpToLangchainTools(mcpSseServerWithAuth);
    } catch (error) {
      console.log('Initial connection failed as expected (auth required):', error.message);
    }

    // Manually perform the authentication flow
    console.log('\nStarting manual authentication flow');
    
    // Step 1: Register the client and get client info
    console.log('Registering client...');
    const clientInfo = await authProvider.requestClientInfo(`${SERVER_URL}/register`);
    console.log('Client information received:');
    console.log(`- Client ID: ${clientInfo.client_id}`);
    console.log(`- Client Secret: ${clientInfo.client_secret ? '[PRESENT]' : '[MISSING]'}`);
    
    // Step 2: Generate code verifier for PKCE with error handling
    console.log('Generating code verifier...');
    let codeVerifier = authProvider.generateCodeVerifier();
    console.log('Code verifier type:', typeof codeVerifier);
    console.log(`Code verifier generated: ${codeVerifier.substring(0, 10)}...`);
    
    // Step 3: Simulate authorization redirect
    console.log('\n========== AUTHORIZATION REQUIRED ==========');
    console.log('In a real application, the user would be redirected to:');
    
    let codeChallenge = await authProvider.generateCodeChallenge(codeVerifier);
    console.log(`Code challenge generated: ${codeChallenge}`);
    
    const authUrl = new URL(`${SERVER_URL}/authorize`);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('client_id', clientInfo.client_id);
    authUrl.searchParams.append('code_challenge', codeChallenge);
    authUrl.searchParams.append('code_challenge_method', 'S256');
    authUrl.searchParams.append('redirect_uri', 'http://localhost:3000/callback');
    
    console.log(authUrl.toString());
    console.log('\nFor this test, we will simulate the flow.\n');
    
    // Step 4: Simulate receiving authorization code
    console.log('Simulating user authorization...');
    console.log('Authorization code would be sent to: http://localhost:3000/callback');
    const authCode = 'valid_auth_code_123';
    console.log(`Authorization code: ${authCode}`);
    
    // Step 5: Exchange code for tokens
    console.log(`Finishing authorization with code: ${authCode}`);
    console.log(`Using client ID: ${clientInfo.client_id}`);
    console.log(`Using code verifier: ${codeVerifier.substring(0, 10)}...`);
    
    // Generate test token directly instead of calling token endpoint
    const testToken = `test_token_${clientInfo.client_id}`;
    console.log(`Setting test token: ${testToken}`);
    
    await authProvider.setTokens({
      access_token: testToken,
      token_type: 'Bearer',
      expires_in: 3600,
      refresh_token: `refresh_${testToken}`
    });
    
    console.log('Tokens received:');
    console.log(`- Access token: ${testToken.substring(0, 10)}...`);
    console.log(`- Expires in: 3600 seconds`);
    console.log(`- Refresh token: ${`refresh_${testToken}`.substring(0, 10)}...`);
    
    console.log('\nAuthentication completed!');
    
    // Now try to connect with the auth token
    console.log('\nRetrying connection with auth token...');
    
    // Add a delay to ensure the server is ready
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    try {
      await connectWithAuth(authProvider);
    } catch (error) {
      console.error('Failed to connect with auth token:', error);
    }
    
  } catch (error) {
    console.error('Error during authentication or retry:', error);
    console.error(error.stack);
  }
}

main();