import "dotenv/config";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { isInteropZodSchema } from "@langchain/core/utils/types";

import { applyOpenAIIntegrationFix } from "../src/openai-integration-fix";

/**
 * More comprehensive investigation of the OpenAI integration issue.
 * This test tries to reproduce the exact conditions that cause the bug.
 */

// Create a test tool with a clean JSON schema (exactly like MCP tools)
function createMcpStyleTool() {
  const schema = {
    type: "object",
    properties: {
      state: {
        type: "string",
        description: "Two-letter US state code (e.g. CA, NY)"
      }
    },
    required: ["state"],
    additionalProperties: false
  };

  console.log("📋 Schema details:");
  console.log("  Type:", typeof schema);
  console.log("  Constructor:", schema.constructor.name);
  console.log("  Has _def:", "_def" in schema);
  console.log("  Has _zod:", "_zod" in schema);
  console.log("  isInteropZodSchema:", isInteropZodSchema(schema));
  console.log("  Schema:", JSON.stringify(schema, null, 2));

  return new DynamicStructuredTool({
    name: "get-weather-alerts",
    description: "Get weather alerts for a US state",
    schema: schema,
    func: async (input: { state: string }) => {
      return `Weather alerts for ${input.state}: None currently active.`;
    }
  });
}

async function investigateOpenAIIntegration() {
  console.log("🔬 OpenAI Integration Investigation");
  console.log("===================================");
  
  // Check package versions
  console.log("\n📦 Package Versions:");
  try {
    const langchainOpenAI = require("@langchain/openai/package.json");
    console.log("  @langchain/openai:", langchainOpenAI.version);
  } catch (e) {
    console.log("  @langchain/openai: Could not read version");
  }
  
  try {
    const openai = require("openai/package.json");
    console.log("  openai:", openai.version);
  } catch (e) {
    console.log("  openai: Could not read version");
  }

  try {
    const langchainCore = require("@langchain/core/package.json");
    console.log("  @langchain/core:", langchainCore.version);
  } catch (e) {
    console.log("  @langchain/core: Could not read version");
  }

  // Test 1: Just create the tool
  console.log("\n🔧 Test 1: Creating DynamicStructuredTool...");
  let tool;
  try {
    tool = createMcpStyleTool();
    console.log("✅ Tool created successfully");
  } catch (error) {
    console.log("❌ Tool creation failed:", error);
    return;
  }

  // Test 2: Create OpenAI model
  console.log("\n🤖 Test 2: Creating ChatOpenAI model...");
  let llm;
  try {
    llm = new ChatOpenAI({ 
      model: "gpt-4.1-nano",
      temperature: 0
    });
    console.log("✅ OpenAI model created successfully");
  } catch (error) {
    console.log("❌ OpenAI model creation failed:", error);
    return;
  }

  // Test 3: Create agent (this is where the bug typically occurs)
  console.log("\n🚀 Test 3: Creating React agent with tool...");
  try {
    const agent = createReactAgent({
      llm,
      tools: [tool]
    });
    console.log("✅ Agent created successfully - no bug detected!");
    
    // Test 4: Try to actually invoke the agent
    console.log("\n💬 Test 4: Invoking agent...");
    try {
      const result = await agent.invoke({
        messages: [new HumanMessage("Check weather alerts for California")]
      });
      
      const response = result.messages[result.messages.length - 1].content;
      console.log("✅ Agent invocation successful!");
      console.log("📝 Response:", response);
      
    } catch (invokeError) {
      console.log("❌ Agent invocation failed:", invokeError);
      
      if (invokeError instanceof Error && invokeError.message.includes("typeName")) {
        console.log("🎯 Found the typeName bug during invocation!");
        return "bug_found_in_invocation";
      }
    }
    
  } catch (agentError) {
    console.log("❌ Agent creation failed:", agentError);
    
    if (agentError instanceof Error && agentError.message.includes("typeName")) {
      console.log("🎯 Found the typeName bug during agent creation!");
      return "bug_found_in_creation";
    } else {
      console.log("🤷 Different error - not the expected typeName bug");
      console.log("Error details:", agentError);
    }
  }

  return "no_bug_found";
}

async function testWithActualMcpTool() {
  console.log("\n🌤️  Test 5: Testing with actual MCP weather tool...");
  
  try {
    // Import your actual MCP conversion function
    const { convertMcpToLangchainTools } = await import("../src/langchain-mcp-tools");
    
    const mcpServers = {
      weather: {
        command: "npx",
        args: ["-y", "@h1deya/mcp-server-weather"]
      }
    };

    console.log("🔄 Converting MCP server to LangChain tools...");
    const { tools, cleanup } = await convertMcpToLangchainTools(mcpServers, { 
      logLevel: "warn" // Reduce noise
    });

    console.log(`✅ Got ${tools.length} MCP tools`);
    
    if (tools.length > 0) {
      console.log("🔍 Examining first tool schema:");
      const firstTool = tools[0];
      console.log("  Tool name:", firstTool.name);
      console.log("  Schema type:", typeof firstTool.schema);
      console.log("  Schema constructor:", firstTool.schema?.constructor?.name);
      console.log("  Has _def:", firstTool.schema && "_def" in firstTool.schema);
      console.log("  Has _zod:", firstTool.schema && "_zod" in firstTool.schema);
      console.log("  isInteropZodSchema:", isInteropZodSchema(firstTool.schema));

      console.log("\n🤖 Creating OpenAI model with MCP tools...");
      const llm = new ChatOpenAI({ model: "gpt-4.1-nano" });
      
      console.log("🚀 Creating agent with MCP tools...");
      const agent = createReactAgent({ llm, tools });
      
      console.log("✅ Agent with MCP tools created successfully!");
      
      // Test with a simple query
      console.log("💬 Testing agent invocation...");
      const result = await agent.invoke({
        messages: [new HumanMessage("Are there any weather alerts in California?")]
      });
      
      const response = result.messages[result.messages.length - 1].content;
      console.log("✅ MCP tool test successful!");
      console.log("📝 Response:", response);
    }

    await cleanup();
    return "mcp_test_success";
    
  } catch (error) {
    console.log("❌ MCP tool test failed:", error);
    
    if (error instanceof Error && error.message.includes("typeName")) {
      console.log("🎯 Found the typeName bug with MCP tools!");
      return "bug_found_with_mcp";
    }
    
    return "mcp_test_failed";
  }
}

export async function comprehensiveInvestigation() {
  const result1 = await investigateOpenAIIntegration();
  
  let result2;
  try {
    result2 = await testWithActualMcpTool();
  } catch (e) {
    result2 = "mcp_test_error";
    console.log("MCP test encountered error:", e);
  }
  
  console.log("\n🏁 Investigation Summary");
  console.log("========================");
  console.log("Basic OpenAI integration:", result1);
  console.log("MCP tools test:", result2);
  
  if (result1 === "no_bug_found" && result2 === "mcp_test_success") {
    console.log("\n🎉 Conclusion: The upstream bug appears to be fixed!");
    console.log("💡 Your fix may no longer be needed, but it's good to keep as a safeguard.");
    console.log("🔧 Consider keeping the fix as optional or updating documentation to reflect the status.");
  } else if (result1.includes("bug_found") || result2.includes("bug_found")) {
    console.log("\n🐛 Conclusion: The bug still exists!");
    console.log("🛠️  Your fix is still needed and valuable.");
  } else {
    console.log("\n🤔 Conclusion: Results are inconclusive.");
    console.log("📋 The bug may be environment-specific or conditional.");
    console.log("🛡️  It's safer to keep the fix available as a precaution.");
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  comprehensiveInvestigation().catch(console.error);
}
