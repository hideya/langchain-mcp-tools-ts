import "dotenv/config";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { DynamicStructuredTool } from "@langchain/core/tools";

import { applyOpenAIIntegrationFix } from "../src/openai-integration-fix";

/**
 * Demonstration of the OpenAI integration bug and its fix.
 * 
 * This test shows:
 * 1. The original bug (occurs during agent invocation)
 * 2. The fix working (when fix is applied)
 */

// Create a simple tool with JSON schema (not Zod schema)
function createTestTool() {
  return new DynamicStructuredTool({
    name: "test-tool",
    description: "A test tool that echoes input",
    schema: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "Message to echo"
        }
      },
      required: ["message"],
      additionalProperties: false
    },
    func: async (input: { message: string }) => {
      return `Echo: ${input.message}`;
    }
  });
}

async function testWithoutFix() {
  console.log("\\n🔴 Testing WITHOUT fix (should fail during invocation)...");
  
  try {
    const tool = createTestTool();
    const llm = new ChatOpenAI({ model: "gpt-4.1-nano" });
    
    // Agent creation usually succeeds
    const agent = createReactAgent({ llm, tools: [tool] });
    console.log("✅ Agent created successfully");
    
    // The bug occurs during invocation when bindTools() is called
    console.log("💬 Testing agent invocation (this should fail with typeName error)...");
    await agent.invoke({
      messages: [new HumanMessage("Use the test tool to echo 'Hello World'")]
    });
    
    console.log("❌ Unexpected success - the bug may have been fixed upstream!");
    return true;
    
  } catch (error) {
    if (error instanceof Error && error.message.includes("typeName")) {
      console.log("✅ Expected typeName error reproduced during invocation");
      console.log("🐛 Error details:", error.message.split('\\n')[0]);
      return false;
    } else {
      console.log("❌ Unexpected error (not the typeName bug):", error);
      throw error;
    }
  }
}

async function testWithFix() {
  console.log("\\n🟢 Testing WITH fix (should work)...");
  
  // Apply the fix
  applyOpenAIIntegrationFix();
  
  try {
    const tool = createTestTool();
    const llm = new ChatOpenAI({ model: "gpt-4.1-nano" });
    
    // This should work now
    const agent = createReactAgent({ llm, tools: [tool] });
    console.log("✅ Agent created successfully");
    
    // Test with a simple query
    console.log("💬 Testing agent invocation with fix applied...");
    const result = await agent.invoke({
      messages: [new HumanMessage("Use the test tool to echo 'Hello World'")]
    });
    
    const response = result.messages[result.messages.length - 1].content;
    console.log("✅ Fix successful! Agent invocation completed");
    console.log("📝 Response preview:", response.slice(0, 100) + "...");
    return true;
    
  } catch (error) {
    console.log("❌ Fix failed:", error);
    throw error;
  }
}

export async function demonstrateBugAndFix(): Promise<void> {
  console.log("🧪 OpenAI Integration Bug Demonstration");
  console.log("=====================================");
  console.log("🔍 Testing the bug that occurs during agent.invoke()");
  
  try {
    // Test 1: Show the bug (occurs during invocation)
    const bugExists = !(await testWithoutFix());
    
    if (bugExists) {
      // Test 2: Show the fix
      await testWithFix();
      
      console.log("\\n🎉 SUCCESS!");
      console.log("✅ Bug reproduced during invocation and fix verified");
      console.log("💡 Use applyOpenAIIntegrationFix() before creating OpenAI models");
      console.log("🔧 The fix prevents the typeName error during agent.invoke()");
    } else {
      console.log("\\n🤔 The upstream bug may have been fixed!");
      console.log("🔍 Consider checking if this fix is still needed");
    }
    
  } catch (error) {
    console.error("\\n💥 Test failed:", error);
    process.exit(1);
  }
}

// Run the demonstration if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateBugAndFix();
}
