/**
 * Test file demonstrating the new Streamable HTTP auto-detection feature
 */

import {
  convertMcpToLangchainTools,
  McpServersConfig,
  McpToolsLogger
} from "../src/langchain-mcp-tools";

// Simple test logger to capture what's happening
class TestLogger implements McpToolsLogger {
  public logs: string[] = [];
  
  private log(level: string, ...args: unknown[]) {
    const message = `[${level}] ${args.join(' ')}`;
    this.logs.push(message);
    console.log(message);
  }
  
  debug(...args: unknown[]) { this.log("DEBUG", ...args); }
  info(...args: unknown[]) { this.log("INFO", ...args); }
  warn(...args: unknown[]) { this.log("WARN", ...args); }
  error(...args: unknown[]) { this.log("ERROR", ...args); }
}

async function testAutoDetection() {
  console.log("🧪 Testing Streamable HTTP Auto-Detection Feature\n");
  
  const logger = new TestLogger();
  
  // Test configurations showing different transport behaviors
  const testConfigs: McpServersConfig = {
    // Auto-detection: will try Streamable HTTP first, fallback to SSE
    "auto-detect-example": {
      url: "http://example.com/mcp"
    },
    
    // Explicit Streamable HTTP: no fallback
    "explicit-streamable": {
      url: "http://example.com/mcp",
      transport: "streamable_http"
    },
    
    // Explicit SSE: direct SSE usage
    "explicit-sse": {
      url: "http://example.com/mcp",
      transport: "sse"
    }
  };

  console.log("📋 Test Configuration:");
  console.log(JSON.stringify(testConfigs, null, 2));
  console.log("\n");

  // Note: This test won't actually connect to servers since the URLs are fake,
  // but it will demonstrate the transport selection logic through the logs
  
  try {
    const { tools, cleanup } = await convertMcpToLangchainTools(testConfigs, { 
      logger,
      logLevel: "debug" 
    });
    
    console.log(`\n✅ Test completed. Found ${tools.length} tools.`);
    await cleanup();
    
  } catch (error) {
    console.log("\n⚠️  Expected error (fake URLs):", error instanceof Error ? error.message : error);
  }

  console.log("\n📊 Log Analysis:");
  console.log("Looking for transport selection messages...\n");
  
  // Analyze the logs to see what transport decisions were made
  const relevantLogs = logger.logs.filter(log => 
    log.includes("Streamable HTTP") || 
    log.includes("SSE") || 
    log.includes("attempting") ||
    log.includes("explicitly configured")
  );
  
  relevantLogs.forEach(log => console.log("  " + log));
  
  console.log("\n🎯 What this demonstrates:");
  console.log("1. Auto-detection tries Streamable HTTP first");
  console.log("2. Explicit transport configuration is respected");
  console.log("3. Fallback logic follows MCP specification");
}

// Run the test
testAutoDetection().catch(console.error);
