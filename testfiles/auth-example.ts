import { convertMcpToLangchainTools } from '../src/langchain-mcp-tools.js';
import { OAuthClientProvider, OAuthClientInformation, OAuthTokens, auth } from '@modelcontextprotocol/sdk/client/auth.js';
import { HumanMessage } from "@langchain/core/messages";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";

/**
 * Example implementation of an OAuthClientProvider
 * This implementation includes interactive authorization flow for the test server
 */
class ExampleOAuthClientProvider implements OAuthClientProvider {
  private _tokens?: OAuthTokens;
  private _clientInfo?: OAuthClientInformation;
  private _codeVerifier?: string;
  
  constructor(
    private readonly _redirectUrl: string,
    private readonly _clientMetadata = {
      client_name: 'MCP LangChain Tools Example',
      redirect_uris: [_redirectUrl],
    },
  ) {}

  get redirectUrl(): string {
    return this._redirectUrl;
  }

  get clientMetadata() {
    return this._clientMetadata;
  }

  clientInformation(): OAuthClientInformation | undefined {
    return this._clientInfo;
  }

  saveClientInformation(clientInformation: OAuthClientInformation): void {
    console.log('Client information received:');
    console.log('- Client ID:', clientInformation.client_id);
    console.log('- Client Secret:', clientInformation.client_secret ? '[PRESENT]' : '[NONE]');
    this._clientInfo = clientInformation;
  }

  tokens(): OAuthTokens | undefined {
    console.log('Tokens requested. Current token status:', this._tokens ? 'Present' : 'Not present');
    if (this._tokens) {
      console.log('Returning access token:', this._tokens.access_token.substring(0, 10) + '...');
    }
    return this._tokens;
  }

  saveTokens(tokens: OAuthTokens): void {
    console.log('Tokens received:');
    console.log('- Access token:', tokens.access_token.substring(0, 10) + '...');
    console.log('- Expires in:', tokens.expires_in, 'seconds');
    console.log('- Refresh token:', tokens.refresh_token ? tokens.refresh_token.substring(0, 10) + '...' : '[NONE]');
    this._tokens = tokens;
  }

  redirectToAuthorization(authorizationUrl: URL): void {
    console.log('\n========== AUTHORIZATION REQUIRED ==========');
    console.log('In a real application, the user would be redirected to:');
    console.log(authorizationUrl.toString());
    console.log('\nFor this test, we will simulate the flow.');
    
    // In our test server, we just need to get a valid authorization code
    // In a real application, the user would be redirected to the authorization URL
    // and then back to the redirectUrl with the code
    simulateAuthorization(this._redirectUrl);
  }

  async finishAuth(authorizationCode: string): Promise<void> {
    console.log('Finishing authorization with code:', authorizationCode);
    
    if (!this._clientInfo) {
      throw new Error('Client information not available. Registration required.');
    }
    
    if (!this._codeVerifier) {
      throw new Error('Code verifier not set. Authorization flow is incomplete.');
    }
    
    console.log('Using client ID:', this._clientInfo.client_id);
    console.log('Using code verifier:', this._codeVerifier.substring(0, 10) + '...');
    
    // For testing, we'll set a token directly
    // In a real application, this would exchange the code for a token with the server
    const testToken: OAuthTokens = {
      access_token: `test_token_${this._clientInfo.client_id}`,
      token_type: 'Bearer',
      expires_in: 3600,
      refresh_token: `refresh_test_token_${this._clientInfo.client_id}`
    };
    
    console.log('Setting test token:', testToken.access_token);
    this.saveTokens(testToken);
  }

  saveCodeVerifier(codeVerifier: string): void {
    console.log('Code verifier saved:', codeVerifier.substring(0, 10) + '...');
    this._codeVerifier = codeVerifier;
  }

  codeVerifier(): string {
    if (!this._codeVerifier) {
      throw new Error('Code verifier not set');
    }
    return this._codeVerifier;
  }
}

/**
 * Simulate the OAuth authorization flow for our test server
 * This function would not be needed in a real application with a browser
 */
async function simulateAuthorization(redirectUrl: string): Promise<void> {
  // For our automated test, we'll skip the user prompt and simulate automatically
  console.log('\nSimulating user authorization...');
  console.log('Authorization code would be sent to:', redirectUrl);
  console.log('Authorization code: valid_auth_code_123');
  
  // Give time for the message to be displayed
  await new Promise(resolve => setTimeout(resolve, 1000));
}

/**
 * Main function to demonstrate MCP server authentication
 */
async function main() {
  // Create an OAuth client provider
  const redirectUrl = 'http://localhost:3000/callback';
  const authProvider = new ExampleOAuthClientProvider(redirectUrl);

  // Set up MCP server config with SSE authentication
  const servers = {
    secureServer: {
      url: 'http://localhost:3333/sse',
      sseOptions: {
        authProvider: authProvider,
        // Add custom headers for debugging
        requestInit: {
          headers: {
            'X-Test-Header': 'test-value'
          }
        }
      }
    }
  };

  // Try the first connection - this will likely fail as we need auth
  console.log('Initializing secure MCP tools...');
  try {
    const { tools, cleanup } = await convertMcpToLangchainTools(servers);
    console.log(`Successfully connected with ${tools.length} tools available`);
    
    // If we succeed on first try, use the tools
    await testTools(tools);
    await cleanup();
    return;
  } catch (error) {
    console.log('Initial connection failed as expected (auth required):', error.message);
  }

  // Manually complete the auth flow
  try {
    console.log('\nStarting manual authentication flow');
    
    // Register the client if needed
    if (!authProvider.clientInformation()) {
      console.log('Client not registered yet, registering...');
      
      // For our test, we'll simulate client registration
      authProvider.saveClientInformation({
        client_id: 'test_client_123',
        client_secret: 'test_secret_456'
      });
    }
    
    // Set a code verifier if needed
    try {
      authProvider.codeVerifier();
    } catch (e) {
      // If code verifier not set, create one
      const testVerifier = 'test_verifier_789';
      console.log('Setting code verifier:', testVerifier);
      authProvider.saveCodeVerifier(testVerifier);
    }
    
    // Finish the authentication with a simulated code
    await authProvider.finishAuth('valid_auth_code_123');
    
    console.log('\nAuthentication completed!');
    
    // Now retry the connection with the authenticated provider
    console.log('\nRetrying connection with auth token...');
    const { tools, cleanup } = await convertMcpToLangchainTools(servers);
    
    console.log(`\nSuccessfully connected with ${tools.length} tools available`);
    
    // Display tools
    console.log('Available tools:');
    tools.forEach(tool => {
      console.log(`- ${tool.name}: ${tool.description}`);
    });

    // Test the tools
    await testTools(tools);
    
    await cleanup();
    console.log('\nTest completed successfully!');
  } catch (authError) {
    console.error('Error during authentication or retry:', authError);
  }
}

/**
 * Test the tools using a simple LangChain agent
 */
async function testTools(tools) {
  console.log('\nTesting the tools...');
  try {
    const llm = new ChatOpenAI({ model: "gpt-3.5-turbo" }); // Use a smaller model for testing
    const agent = createReactAgent({ llm, tools });
    const query = "Please greet me as 'Claude' and tell me the current time.";
    console.log(`\nQuery: ${query}`);
    const result = await agent.invoke({ messages: [new HumanMessage(query)] });
    const response = result.messages[result.messages.length - 1].content;
    console.log(`\nResponse: ${response}`);
    return true;
  } catch (toolError) {
    console.log('Error testing tools:', toolError);
    console.log('But authentication was successful!');
    return false;
  }
}

// Call the main function
main().catch(console.error);
