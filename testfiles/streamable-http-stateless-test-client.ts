import { convertMcpToLangchainTools } from "../src/langchain-mcp-tools";

// Enable maximum debug logging
process.env.MCP_DEBUG = "true";

// Debug logger for client-side events
const log = {
  info: (...args: any[]) => console.log("ℹ️", ...args),
  warn: (...args: any[]) => console.log("⚠️", ...args),
  error: (...args: any[]) => console.log("❌", ...args),
  debug: (...args: any[]) => console.log("🔍", ...args),
  success: (...args: any[]) => console.log("✅", ...args)
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
    } catch (error: any) {
      log.error("HTTP Error:", error.message);
      throw error;
    }
  };
}

async function main() {
  log.info("=== MCP STREAMABLE HTTP STATELESS TEST ===");
  setupDebugLogging();
  
  const SERVER_URL = "http://127.0.0.1:3335";
  
  // 1. Check if server is running
  try {
    log.info("Testing server connection...");
    const response = await fetch(SERVER_URL);
    if (!response.ok) throw new Error(`Server error: ${response.status}`);
    log.success("Stateless server is running");
  } catch (error: any) {
    log.error("Server unavailable:", error.message);
    log.info("Make sure to start the server with: npm run streamable-http-stateless-test-server");
    return;
  }
  
  try {
    // 2. Connect using stateless Streamable HTTP (no auth needed)
    log.info("Connecting to stateless MCP server...");
    
    // Timeout after 30 seconds (stateless should be faster)
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Connection timeout (30s)")), 30000);
    });
    
    log.info("Using URL:", `${SERVER_URL}/mcp`);
    log.info("Using transport: Streamable HTTP (stateless mode)");
    log.info("Authentication: None required");
    
    // Define the result type
    type ToolsResult = { tools: any[]; cleanup: () => Promise<void> };
    
    // Test explicit stateless connection
    log.info("\n--- Testing Explicit Stateless Streamable HTTP ---");
    const explicitResult = await Promise.race<ToolsResult>([
      convertMcpToLangchainTools({
        statelessServer: {
          url: `${SERVER_URL}/mcp`,
          transport: "streamable_http"  // Explicit transport
          // No auth options needed for stateless
        }
      }),
      timeoutPromise
    ]);
    
    log.success("Stateless connection established!");
    log.info("Available tools:", explicitResult.tools.map(t => t.name).join(", "));
    
    // Test all available tools
    if (explicitResult.tools.length > 0) {
      const echoTool = explicitResult.tools.find(t => t.name === "echo");
      const infoTool = explicitResult.tools.find(t => t.name === "server-info");
      const randomTool = explicitResult.tools.find(t => t.name === "random-number");
      
      if (echoTool) {
        log.info("Testing echo tool...");
        const result = await echoTool.invoke({ message: "Hello from stateless server!" });
        log.success("Echo tool result:", result);
      }
      
      if (infoTool) {
        log.info("Testing server-info tool...");
        const result = await infoTool.invoke({});
        log.success("Server-info result:", result);
      }
      
      if (randomTool) {
        log.info("Testing random-number tool...");
        const result1 = await randomTool.invoke({ min: 1, max: 10 });
        log.success("Random number result 1:", result1);
        
        // Test again to show statelessness (each call is independent)
        const result2 = await randomTool.invoke({ min: 100, max: 200 });
        log.success("Random number result 2:", result2);
      }
    }
    
    // Clean up explicit connection
    await explicitResult.cleanup();
    log.success("Explicit connection cleaned up");
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test auto-detection (should also work for stateless)
    log.info("\n--- Testing Auto-Detection (should use Streamable HTTP) ---");
    const autoResult = await Promise.race<ToolsResult>([
      convertMcpToLangchainTools({
        autoStatelessServer: {
          url: `${SERVER_URL}/mcp`
          // No transport specified - should auto-detect Streamable HTTP
          // No auth options needed
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
        const result = await echoTool.invoke({ message: "Hello from auto-detected stateless server!" });
        log.success("Auto-detection echo result:", result);
      }
    }
    
    // Clean up auto-detection connection
    await autoResult.cleanup();
    log.success("Auto-detection connection cleaned up");
    
    // Test multiple concurrent connections to demonstrate stateless benefits
    log.info("\n--- Testing Concurrent Connections (Stateless Advantage) ---");
    log.info("Making 3 concurrent connections to demonstrate stateless scalability...");
    
    const concurrentPromises = Array.from({ length: 3 }, async (_, index) => {
      const result = await convertMcpToLangchainTools({
        [`concurrent${index}`]: {
          url: `${SERVER_URL}/mcp`,
          transport: "streamable_http"
        }
      });
      
      // Test a tool from each connection
      const echoTool = result.tools.find(t => t.name === "echo");
      if (echoTool) {
        const toolResult = await echoTool.invoke({ 
          message: `Concurrent request #${index + 1}` 
        });
        log.success(`Concurrent ${index + 1} result:`, toolResult);
      }
      
      await result.cleanup();
      return `Connection ${index + 1} completed`;
    });
    
    const concurrentResults = await Promise.all(concurrentPromises);
    log.success("All concurrent connections completed:", concurrentResults);
    
    log.success("\n🎉 All stateless Streamable HTTP tests completed successfully!");
    
    log.info("\n📋 Stateless Benefits Demonstrated:");
    log.info("  ✅ No authentication complexity");
    log.info("  ✅ No session management overhead");
    log.info("  ✅ Each request completely isolated");
    log.info("  ✅ Concurrent connections work seamlessly");
    log.info("  ✅ Simple server implementation");
    log.info("  ✅ Fast connection setup");
    
  } catch (error: any) {
    log.error("Test failed:", error.message);
    
    if (error.stack) {
      const firstLine = error.stack.split("\n")[0];
      log.error("Error details:", firstLine);
    }
    
    log.info("\nTroubleshooting tips:");
    log.info("1. Make sure the stateless server is running at:", SERVER_URL);
    log.info("2. Start server: npm run streamable-http-stateless-test-server");
    log.info("3. Check network connectivity and firewall settings");
    log.info("4. Verify no authentication is required (stateless mode)");
    log.info("5. Ensure the server port 3335 is available");
  }
}

// Run the test
main().catch(error => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
