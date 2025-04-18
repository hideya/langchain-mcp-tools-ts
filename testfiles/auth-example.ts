import { convertMcpToLangchainTools } from '../src/langchain-mcp-tools';
import { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import pkceChallenge from 'pkce-challenge';

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

  async saveCodeVerifier(verifier: string) {
    this._codeVerifier = verifier;
    return verifier;
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
      console.log('Attempting to generate code verifier with pkceChallenge...');
      const result = pkceChallenge();
      console.log('pkceChallenge result:', result);
      
      if (result && result.code_verifier) {
        this._codeVerifier = result.code_verifier;
        return this._codeVerifier;
      } else {
        console.log('pkceChallenge returned an invalid result, using default code verifier');
        return this._codeVerifier;
      }
    } catch (error) {
      console.error('Error generating code verifier:', error);
      // Use default code verifier if pkceChallenge fails
      return this._codeVerifier;
    }
  }

  // Generate a code challenge for PKCE
  async generateCodeChallenge(verifier: string) {
    try {
      // Preferred approach using pkceChallenge
      const result = pkceChallenge(verifier);
      if (result && result.code_challenge) {
        return result.code_challenge;
      }
      
      // Fallback: simple base64 encode
      console.log('Falling back to manual code challenge generation');
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
  }

  // Set tokens directly (for testing)
  async setTokens(tokens: any) {
    return this.saveTokens(tokens);
  }
}

async function main() {
  console.log('Initializing secure MCP tools...');

  // Create our OAuth provider
  const authProvider = new TestOAuthProvider({
    clientMetadata: {
      client_name: 'MCP LangChain Tools Example',
      redirect_uris: ['http://localhost:3000/callback']
    },
    redirectUrl: 'http://localhost:3000/callback'
  });

  try {
    // First connection attempt will fail because we need to authenticate
    console.log('Attempting initial connection (expected to fail)...');
    try {
      await convertMcpToLangchainTools({
        secureServer: {
          url: 'http://localhost:3333/sse',
          sseOptions: {
            authProvider,
            requestInit: {
              headers: {
                'X-Test-Header': 'test-value'
              }
            }
          }
        }
      });
    } catch (error) {
      console.log('Initial connection failed as expected (auth required):', error.message);
    }

    // Manually perform the authentication flow
    console.log('\nStarting manual authentication flow');
    
    // Step 1: Register the client and get client info
    console.log('Registering client...');
    const clientInfo = await authProvider.requestClientInfo('http://localhost:3333/register');
    console.log('Client information received:');
    console.log(`- Client ID: ${clientInfo.client_id}`);
    console.log(`- Client Secret: ${clientInfo.client_secret ? '[PRESENT]' : '[MISSING]'}`);
    
    // Step 2: Generate code verifier for PKCE with error handling
    console.log('Generating code verifier...');
    let codeVerifier;
    try {
      codeVerifier = authProvider.generateCodeVerifier();
      console.log('Code verifier type:', typeof codeVerifier);
      console.log(`Code verifier generated: ${codeVerifier ? codeVerifier.substring(0, 10) + '...' : 'undefined or null'}`);
    } catch (error) {
      console.error('Error in code verifier generation:', error);
      codeVerifier = 'default_code_verifier_for_testing_123456789012345678901234567890';
      console.log(`Using fallback code verifier: ${codeVerifier.substring(0, 10)}...`);
    }
    
    // Step 3: Simulate authorization redirect
    console.log('\n========== AUTHORIZATION REQUIRED ==========');
    console.log('In a real application, the user would be redirected to:');
    
    let codeChallenge;
    try {
      codeChallenge = await authProvider.generateCodeChallenge(codeVerifier);
      console.log(`Code challenge generated: ${codeChallenge}`);
    } catch (error) {
      console.error('Error generating code challenge:', error);
      codeChallenge = 'fallback_code_challenge';
      console.log(`Using fallback code challenge: ${codeChallenge}`);
    }
    
    const authUrl = new URL('http://localhost:3333/authorize');
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
    
    const tools = await convertMcpToLangchainTools({
      secureServer: {
        url: 'http://localhost:3333/sse',
        sseOptions: {
          authProvider,
          requestInit: {
            headers: {
              'X-Test-Header': 'test-value'
            }
          }
        }
      }
    });
    
    console.log('Connection successful!');
    console.log('Available tools:', Object.keys(tools.secureServer));
    
    // Test the echo method
    try {
      console.log('Testing echo method...');
      const echo = tools.secureServer.echo;
      const echoResult = await echo.invoke({ message: 'Hello, authenticated MCP!' });
      console.log('Echo response:', echoResult);
      console.log('Test completed successfully!');
    } catch (error) {
      console.error('Error calling echo method:', error);
    }
    
  } catch (error) {
    console.error('Error during authentication or retry:', error);
    console.error(error.stack);
  }
}

main();