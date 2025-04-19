import { convertMcpToLangchainTools } from '../src/langchain-mcp-tools';
import { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';

// Enable maximum debug logging
process.env.MCP_DEBUG = 'true';

/**
 * Simple implementation of OAuthClientProvider for testing
 */
class TestAuthProvider implements OAuthClientProvider {
  private _clientInfo = { client_id: 'test_client_id' };
  private _tokens = {
    access_token: 'test_token_test_client_id',
    token_type: 'Bearer',
    expires_in: 3600,
    refresh_token: 'refresh_token'
  };
  private _codeVerifier = 'test_code_verifier';
  
  get redirectUrl() { return 'http://localhost:3000/callback'; }
  get clientMetadata() { 
    return { 
      client_name: 'Test Client',
      redirect_uris: ['http://localhost:3000/callback']
    }; 
  }
  
  async clientInformation() { return this._clientInfo; }
  async saveClientInformation(info) { this._clientInfo = info; }
  async tokens() { return this._tokens; }
  async saveTokens(tokens) { this._tokens = tokens; }
  async codeVerifier() { return this._codeVerifier; }
  async saveCodeVerifier(verifier) { this._codeVerifier = verifier; }
  async redirectToAuthorization(url) { throw new Error('Auth required'); }
}

// Debug logger for client-side events
const log = {
  info: (...args) => console.log('ℹ️', ...args),
  warn: (...args) => console.log('⚠️', ...args),
  error: (...args) => console.log('❌', ...args),
  debug: (...args) => console.log('🔍', ...args),
  success: (...args) => console.log('✅', ...args)
};

// Enhanced debug logging for HTTP and EventSource
function setupDebugLogging() {
  const originalFetch = global.fetch;
  global.fetch = async function(...args: Parameters<typeof fetch>) {
    log.debug('HTTP Request:', args[0].toString().substring(0, 80));
    
    try {
      const response = await originalFetch(...args);
      log.debug(`HTTP Response: ${response.status} ${response.statusText}`);
      return response;
    } catch (error) {
      log.error('HTTP Error:', error.message);
      throw error;
    }
  };
}

async function main() {
  log.info('=== MCP SSE AUTH FINAL TEST ===');
  setupDebugLogging();
  
  const SERVER_URL = 'http://127.0.0.1:3333';
  
  // 1. Check if server is running
  try {
    log.info('Testing server connection...');
    const response = await fetch(SERVER_URL);
    if (!response.ok) throw new Error(`Server error: ${response.status}`);
    log.success('Server is running');
  } catch (error) {
    log.error('Server unavailable:', error.message);
    return;
  }
  
  // 2. Create auth provider and prepare for connection
  const authProvider = new TestAuthProvider();
  log.info('Using access token:', (await authProvider.tokens()).access_token);
  
  try {
    // 3. Connect with auth provider
    log.info('Connecting to MCP with auth...');
    
    // Timeout after 20 seconds
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Connection timeout (20s)')), 20000);
    });
    
    const connectionPromise = convertMcpToLangchainTools({
      secureServer: {
        url: `${SERVER_URL}/sse`,
        sseOptions: {
          authProvider,
          requestInit: {
            headers: { 'X-Test-Header': 'test-value' }
          }
        }
      }
    });
    
    log.info('Waiting for connection to complete...');
    const result = await Promise.race([connectionPromise, timeoutPromise]) as any;
    
    const { tools, cleanup } = result;
    log.success('Connection established successfully!');
    log.info('Available tools:', tools.map(t => t.name).join(', '));
    
    // 4. Test a tool if available
    if (tools.length > 0) {
      const echoTool = tools.find(t => t.name === 'echo');
      if (echoTool) {
        log.info('Testing echo tool...');
        const result = await echoTool.invoke({ message: 'Hello, authenticated MCP!' });
        log.success('Echo tool result:', result);
      } else {
        log.warn('Echo tool not available');
      }
    } else {
      log.warn('No tools available');
    }
    
    // 5. Clean up the connection
    log.info('Cleaning up connection...');
    await cleanup();
    log.success('Test completed successfully!');
    
  } catch (error) {
    log.error('Test failed:', error.message);
    if (error.details) log.error('Error details:', error.details);
    if (error.stack) log.error('Stack trace:', error.stack);
  }
}

// Run the test
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});