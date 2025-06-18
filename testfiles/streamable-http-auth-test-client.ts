import { convertMcpToLangchainTools } from "../src/langchain-mcp-tools";
import { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";

// Enable maximum debug logging
process.env.MCP_DEBUG = "true";

/**
 * ⚠️ TEST IMPLEMENTATION ONLY - NOT OAUTH 2.1 COMPLIANT
 *
 * This is a simplified test implementation that does NOT comply with OAuth 2.1 requirements.
 * It's designed solely for testing MCP authentication integration and transport functionality.
 *
 * For production use, you MUST implement:
 * - PKCE (Proof Key for Code Exchange) - REQUIRED in OAuth 2.1
 * - Authorization Code Flow with proper user consent and authorization server
 * - Authorization Server Metadata discovery (RFC8414)
 * - Secure token storage, validation, and refresh
 * - Dynamic Client Registration (RFC7591) - RECOMMENDED
 *
 * Consider using production-ready OAuth 2.1 libraries:
 * - @auth0/auth0-spa-js
 * - oidc-client-ts
 * - passport-oauth2
 * - node-oauth2-server
 *
 * This test implementation uses:
 * - Hardcoded tokens (❌ Security risk)
 * - No real authorization flow (❌ Missing OAuth core)
 * - Mock PKCE values (❌ Not cryptographically secure)
 * - No token validation (❌ Missing security)
 */
class TestStreamableAuthProvider implements OAuthClientProvider {
  private _clientInfo = { client_id: "test_streamable_client_id" };
  private _tokens = {
    access_token: "test_token_test_streamable_client_id",
    token_type: "Bearer",
    expires_in: 3600,
    refresh_token: "refresh_token_streamable"
  };
  private _codeVerifier = "test_code_verifier_streamable";
  
  get redirectUrl() { return "http://localhost:3000/callback"; }
  get clientMetadata() { 
    return { 
      client_name: "Test Streamable HTTP Client",
      redirect_uris: ["http://localhost:3000/callback"]
    }; 
  }
  
  async clientInformation() { return this._clientInfo; }
  async saveClientInformation(info) { this._clientInfo = info; }
  async tokens() { return this._tokens; }
  async saveTokens(tokens) { this._tokens = tokens; }
  async codeVerifier() { return this._codeVerifier; }
  async saveCodeVerifier(verifier) { this._codeVerifier = verifier; }
  async redirectToAuthorization(url) { throw new Error("Auth required"); }
}

// Debug logger for client-side events
const log = {
  info: (...args) => console.log("ℹ️", ...args),
  warn: (...args) => console.log("⚠️", ...args),
  error: (...args) => console.log("❌", ...args),
  debug: (...args) => console.log("🔍", ...args),
  success: (...args) => console.log("✅", ...args)
};

// Enhanced debug logging for HTTP
function setupDebugLogging() {
  const originalFetch = global.fetch;
  global.fetch = async function(...args: Parameters<typeof fetch>) {
    const url = args[0].toString();
    const method = args[1]?.method || "GET";
    log.debug(`HTTP ${method} Request:`, url.substring(0, 80));
    
    // Log request headers if present
    if (args[1]?.headers) {
      log.debug("Request Headers:", args[1].headers);
    }
    
    try {
      const response = await originalFetch(...args);
      log.debug(`HTTP Response: ${response.status} ${response.statusText}`);
      
      // Clone the response so we can read the body for debugging
      // but only for error responses
      if (!response.ok) {
        const clonedResponse = response.clone();
        const bodyText = await clonedResponse.text();
        log.debug(`Response Body:`, bodyText.substring(0, 200));
      }
      
      return response;
    } catch (error) {
      log.error("HTTP Error:", error.message);
      throw error;
    }
  };
}

async function main() {
  log.info("=== MCP STREAMABLE HTTP AUTH TEST ===");
  setupDebugLogging();
  
  const SERVER_URL = "http://127.0.0.1:3334";
  
  // 1. Check if server is running
  try {
    log.info("Testing server connection...");
    const response = await fetch(SERVER_URL);
    if (!response.ok) throw new Error(`Server error: ${response.status}`);
    log.success("Server is running");
  } catch (error) {
    log.error("Server unavailable:", error.message);
    log.info("Make sure to start the server with: npm run streamable-http-auth-test-server");
    return;
  }
  
  // 2. Create auth provider and prepare for connection
  const authProvider = new TestStreamableAuthProvider();
  const tokens = await authProvider.tokens();
  const tokenPreview = tokens.access_token.substring(0, 20) + "...";
  log.info("Using access token:", tokenPreview);
  log.debug("Auth provider ready with client ID:", (await authProvider.clientInformation()).client_id);
  
  try {
    // 3. Connect with auth provider using Streamable HTTP
    log.info("Connecting to MCP with Streamable HTTP auth...");
    
    // Timeout after 60 seconds to give server time to respond
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Connection timeout (60s)")), 60000);
    });
    
    log.info("Using URL:", `${SERVER_URL}/mcp`);
    log.info("Using transport: Streamable HTTP");
    log.info("Using access token type:", tokens.token_type);
    
    // Define the result type
    type ToolsResult = { tools: any[]; cleanup: () => Promise<void> };
    
    // Test both explicit and auto-detection
    log.info("\n--- Testing Explicit Streamable HTTP Transport ---");
    const explicitResult = await Promise.race<ToolsResult>([
      convertMcpToLangchainTools({
        secureStreamableServer: {
          url: `${SERVER_URL}/mcp`,
          transport: "streamable_http",  // Explicit
          streamableHTTPOptions: {
            authProvider
          }
        }
      }),
      timeoutPromise
    ]);
    
    log.success("Explicit Streamable HTTP connection established!");
    log.info("Available tools:", explicitResult.tools.map(t => t.name).join(", "));
    
    // Test tools with explicit connection
    if (explicitResult.tools.length > 0) {
      const echoTool = explicitResult.tools.find(t => t.name === "echo");
      const infoTool = explicitResult.tools.find(t => t.name === "server-info");
      
      if (echoTool) {
        log.info("Testing echo tool...");
        const result = await echoTool.invoke({ message: "Hello from Streamable HTTP!" });
        log.success("Echo tool result:", result);
      }
      
      if (infoTool) {
        log.info("Testing server-info tool...");
        const result = await infoTool.invoke({});
        log.success("Server-info result:", result);
      }
    }
    
    // Clean up explicit connection
    await explicitResult.cleanup();
    log.success("Explicit connection cleaned up");
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    log.info("\n--- Testing Auto-Detection (should use Streamable HTTP) ---");
    const autoResult = await Promise.race<ToolsResult>([
      convertMcpToLangchainTools({
        autoStreamableServer: {
          url: `${SERVER_URL}/mcp`,
          // No transport specified - should auto-detect and use Streamable HTTP
          streamableHTTPOptions: {
            authProvider
          }
        }
      }),
      timeoutPromise
    ]);
    
    log.success("Auto-detection connection established!");
    log.info("Available tools:", autoResult.tools.map(t => t.name).join(", "));
    
    // Test tools with auto-detection
    if (autoResult.tools.length > 0) {
      const echoTool = autoResult.tools.find(t => t.name === "echo");
      if (echoTool) {
        log.info("Testing echo tool with auto-detection...");
        const result = await echoTool.invoke({ message: "Hello from auto-detected Streamable HTTP!" });
        log.success("Auto-detection echo result:", result);
      }
    }
    
    // Clean up auto-detection connection
    await autoResult.cleanup();
    log.success("Auto-detection connection cleaned up");
    
    log.success("\n🎉 All Streamable HTTP authentication tests completed successfully!");
    
  } catch (error) {
    log.error("Test failed:", error.message);
    
    if (error.stack) {
      const firstLine = error.stack.split("\n")[0];
      log.error("Error details:", firstLine);
    }
    
    log.info("\nTroubleshooting tips:");
    log.info("1. Make sure the Streamable HTTP server is running at:", SERVER_URL);
    log.info("2. Start server: npm run streamable-http-auth-test-server");
    log.info("3. Verify the token format matches what the server expects");
    log.info("4. Check network connectivity and firewall settings");
    log.info("5. Ensure MCP SDK supports Streamable HTTP transport");
  }
}

// Run the test
main().catch(error => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
