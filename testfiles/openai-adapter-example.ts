/**
 * Example usage of the OpenAI schema adapter
 * This shows how to convert MCP tool schemas to OpenAI-compatible format
 */

import { transformMcpToolForOpenAI, makeJsonSchemaOpenAICompatible, validateOpenAISchema } from '../src/schema-adapter-openai.js';

// Example MCP tool with complex schema
const exampleMcpTool = {
  name: "get_weather",
  description: "Get the current weather for a location",
  inputSchema: {
    type: "object",
    properties: {
      location: {
        type: "string",
        description: "The city and state, e.g. San Francisco, CA"
      },
      unit: {
        type: ["string", "null"], // Type array - will be converted
        enum: ["celsius", "fahrenheit"],
        description: "Temperature unit"
      },
      include_forecast: {
        type: "boolean",
        description: "Whether to include forecast data",
        default: false // Will be removed for OpenAI
      },
      details: {
        type: "object",
        properties: {
          humidity: { type: "boolean" },
          wind_speed: { type: "boolean" }
        },
        additionalProperties: true // Will be changed to false
      }
    },
    required: ["location"],
    $defs: { // Will be resolved and removed
      TemperatureUnit: {
        type: "string",
        enum: ["celsius", "fahrenheit"]
      }
    }
  }
};

console.log("=== Original MCP Tool ===");
console.log(JSON.stringify(exampleMcpTool, null, 2));

console.log("\n=== Transforming to OpenAI format ===");
const openAIResult = transformMcpToolForOpenAI(exampleMcpTool);

console.log("OpenAI Function Declaration:");
console.log(JSON.stringify(openAIResult.functionDeclaration, null, 2));

console.log(`\nWas transformed: ${openAIResult.wasTransformed}`);
if (openAIResult.changesSummary) {
  console.log(`Changes: ${openAIResult.changesSummary}`);
}

console.log("\n=== Validation ===");
const validationErrors = validateOpenAISchema(openAIResult.functionDeclaration.function.parameters);
if (validationErrors.length > 0) {
  console.log("Validation errors:");
  validationErrors.forEach(error => console.log(`  - ${error}`));
} else {
  console.log("✅ Schema is valid for OpenAI!");
}

// Example of using with OpenAI API (pseudo-code)
console.log("\n=== Usage with OpenAI API ===");
const apiExample = {
  model: "gpt-4",
  messages: [
    { role: "user", content: "What's the weather like in San Francisco?" }
  ],
  tools: [openAIResult.functionDeclaration],
  tool_choice: "auto"
};

console.log("OpenAI API request structure:");
console.log(JSON.stringify(apiExample, null, 2));
