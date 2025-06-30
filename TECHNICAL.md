# Technical Documentation

This document captures deep technical issues encountered during the implementation of this library, along with solutions and industry context.

## 1. LLM Provider Schema Compatibility Issue

### Problem Statement

There is a **fundamental incompatibility** between OpenAI's and Google Gemini's JSON Schema requirements for function calling that makes it impossible to create a single schema that fully satisfies both providers' strictest requirements.

### The Core Conflict

#### OpenAI Structured Outputs Requirements
- **Mandatory**: Optional fields MUST be nullable (`nullable: true` or `anyOf` with null type)
- **Documentation**: [OpenAI Structured Outputs Guide](https://platform.openai.com/docs/guides/structured-outputs?api-mode=responses#all-fields-must-be-required)
- **Error when violated**: 
  ```
  Zod field uses `.optional()` without `.nullable()` which is not supported by the API
  ```

#### Google Gemini Requirements  
- **Restriction**: The `nullable` property is completely unsupported
- **Conflict**: `anyOf`/`oneOf`/`allOf` cannot coexist with other properties
- **Error when violated**:
  ```
  Unable to submit request because `edit_file` functionDeclaration `parameters.dryRun` 
  schema specified other fields alongside any_of. When using any_of, it must be the 
  only field set.
  ```

#### The Impossible Equation
```
OpenAI requires: optional field + nullable = ✅
Gemini requires: optional field + NO nullable = ✅  
Both together: optional field + (nullable AND NO nullable) = ❌ IMPOSSIBLE
```

### Industry Evidence

This is not an isolated issue but a **market-wide compatibility crisis** affecting the entire LLM ecosystem:

#### 1. Mastra's Tool Compatibility Layer
**Company**: Mastra (TypeScript agent framework)  
**Problem Scale**: "tool calling error rates from 15% to 3% for 12 OpenAI, Anthropic, and Google Gemini models"  
**Root Cause**: "tool calls would fail with some models and succeed with others"  
**Solution Approach**: "changing nullable fields to optional"  
**Source**: [Mastra Blog - MCP Tool Compatibility Layer](https://mastra.ai/blog/mcp-tool-compatibility-layer)

#### 2. Provider-Specific Behavior Patterns
Research by Mastra revealed consistent patterns across providers:

- **OpenAI**: "if they didn't support a property, would throw an error with a message like 'invalid schema for tool X'"
- **Google Gemini**: "wouldn't explicitly fail, but they would silently ignore properties like the length of a string, or minimum length of an array"  
- **Anthropic**: "performed quite well, the majority of the ones we tested did not error at all"

#### 3. Industry Standardization Problem
Multiple sources confirm this as a fundamental industry issue:

**Quote**: "The lack of standardization in LLM APIs makes it difficult to switch providers, for both companies and developers of LLM-wrapping packages"  
**Source**: [Towards Data Science - OpenAI Compatible API](https://towardsdatascience.com/how-to-build-an-openai-compatible-api-87c8edea2f06/)

**Quote**: "Gen AI & LLM providers like OpenAI, Anthropic, and Google all seem to creating different API schemas (perhaps intentionally)"  
**Source**: [Towards Data Science - OpenAI Compatible API](https://towardsdatascience.com/how-to-build-an-openai-compatible-api-87c8edea2f06/)

#### 4. Multiple Compatibility Solutions Being Built

The widespread nature of this problem is evidenced by numerous libraries attempting to solve it:

- **LiteLLM**: "Python SDK, Proxy Server (LLM Gateway) to call 100+ LLM APIs in OpenAI format" ([GitHub](https://github.com/BerriAI/litellm))
- **LlmTornado**: ".NET library to build AI systems with 100+ LLM APIs" ([GitHub](https://github.com/lofcz/LlmTornado))  
- **Mastra**: "MCP Tool Compatibility Layer" for multiple providers
- **Various OpenAI-compatible APIs**: Numerous attempts to create universal interfaces

### The Severity Problem: Gemini's Hard Failures

Unlike OpenAI which issues warnings but continues execution, **Gemini terminates with cryptic 400 errors**:

```
GoogleGenerativeAIFetchError: [GoogleGenerativeAI Error]: Error fetching from 
https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent: 
[400 Bad Request] Unable to submit request because `edit_file` functionDeclaration 
`parameters.dryRun` schema specified other fields alongside any_of. When using any_of, 
it must be the only field set.
```

**This hard failure makes Gemini the "limiting factor"** - applications simply crash rather than degrading gracefully like with OpenAI.

### Industry Gap: LangChain's Official Position  

LangChain's official MCP adapters **do not address this compatibility issue**:

#### **LangChain.js MCP Adapters Analysis**
**Repository**: [langchainjs/libs/langchain-mcp-adapters](https://github.com/langchain-ai/langchainjs/tree/main/libs/langchain-mcp-adapters)  
**Focus Areas**: Transport management, content handling, authentication  
**Schema Compatibility**: **Not addressed**

LangChain's adapters focus on:
- Transport layer abstraction (stdio, SSE, Streamable HTTP)
- Content block transformations (text, images, etc.)  
- Authentication and configuration management
- But **no schema transformations for provider compatibility**

#### **Evidence of Ongoing Issues**
Active GitHub issues confirm compatibility problems persist:
- **Issue #8218**: "Using ChatGoogleGenerativeAI with simple tool call under LangGraph ReactAgent throws error"
- **Community workarounds**: Third-party forks mention "Google's Gemini models require tools to have non-empty parameter schemas"

#### **LangChain's Design Philosophy**
LangChain appears to take a **"pass-through" approach**:
- Minimal adapter functionality
- Raw MCP tool schemas passed directly to LLM providers
- Compatibility issues left for users to resolve

### Our Solution: Provider-Specific Schema Transformation

Given both the technical incompatibility and the industry gap, we implemented **provider-specific transformations**:

#### 1. Updated Architecture Decision
```typescript
if (targetProvider === 'openai') {
  // Pure OpenAI path: full Structured Outputs support, no warnings
  processedSchema = makeJsonSchemaOpenAICompatible(processedSchema);
} else if (targetProvider === 'gemini') {
  // Pure Gemini path: full compatibility, prevents 400 errors
  processedSchema = sanitizeSchemaForGemini(processedSchema);
} else {
  // Unknown provider: use Gemini sanitization as safe default
  // Prevents cryptic termination, ensures broader compatibility
  processedSchema = sanitizeSchemaForGemini(processedSchema);
}
```

#### 2. Gemini Sanitization (Critical for Preventing Crashes)
```typescript
function sanitizeSchemaForGemini(schema: any, logger?: McpToolsLogger, toolName?: string): any {
  // CRITICAL: Remove nullable property entirely - Gemini doesn't support it
  if (sanitized.nullable !== undefined) {
    removedProperties.push("nullable");
    delete sanitized.nullable;
  }

  // Handle anyOf conflicts with other properties  
  if (sanitized.anyOf || sanitized.oneOf || sanitized.allOf) {
    const otherProps = Object.keys(sanitized).filter(key => 
      key !== unionField && key !== '$schema' && key !== '$id'
    );
    
    if (otherProps.length > 0) {
      // Create clean schema with ONLY the union
      const cleanSchema = { [unionField]: unionValue };
      return cleanSchema;
    }
  }
}
```

#### 3. OpenAI Optimization (Pure Path)  
```typescript
function makeJsonSchemaOpenAICompatible(schema: any): any {
  // Add nullable properties for OpenAI Structured Outputs
  if (!required.has(key)) {
    if (processedProp.type && !processedProp.nullable) {
      processedProp.nullable = true;
    } else if (processedProp.anyOf && !processedProp.anyOf.some((s: any) => s.type === "null")) {
      processedProp.anyOf = [...processedProp.anyOf, { type: "null" }];
    }
  }
}
```

### Results and Strategic Value

#### ✅ Solves Critical Production Issues
- **Gemini**: Full compatibility, **no crashes**
- **OpenAI**: Optimal schemas, **no warnings**  
- **Real-world Impact**: Reliable multi-provider deployment

#### ✅ Addresses Industry Gap
- **LangChain doesn't solve this**: Our library fills a genuine market need
- **Prevents application crashes**: Eliminates cryptic 400 errors
- **Production-ready**: Handles provider differences transparently

#### ✅ Strategic Differentiation
```markdown
## Why Not Use LangChain's Official MCP Adapters?

LangChain's official adapters provide basic MCP-to-LangChain conversion but don't address 
LLM provider schema compatibility issues. This library goes further by:

- ✅ **Prevents Gemini crashes** with automatic schema sanitization  
- ✅ **Optimizes OpenAI schemas** for Structured Outputs without warnings
- ✅ **Provider-specific transformations** based on each provider's requirements
- ✅ **Production-ready reliability** across multi-provider deployments

Use this library when you need reliable multi-provider support without compatibility crashes.
```

#### 🎯 Evidence-Based Approach  
Our solution is validated by:
- **Industry research**: Mastra and other compatibility layers use similar approaches
- **Production testing**: Real-world validation with both providers
- **Technical analysis**: Deep understanding of each provider's schema requirements

### Alternative Approaches Considered

1. **Provider-Specific Schemas**: Generate completely separate schemas per provider
2. **Lowest Common Denominator**: Avoid optional fields entirely  
3. **Runtime Detection**: Detect provider and transform accordingly
4. **Prompt-Based Workarounds**: Inject schema constraints into prompts (Mastra's approach)

### Conclusion

This schema compatibility issue represents a **fundamental market failure** in LLM API standardization. Our Gemini-first approach provides the most practical solution for multi-provider support, prioritizing the most restrictive provider while maintaining functional compatibility across the ecosystem.

The widespread nature of this problem, evidenced by multiple commercial solutions and academic discussions, validates that this is not a local implementation issue but rather an **industry-wide compatibility crisis** that every serious LLM integration must address.

---

## Contributing

If you encounter additional technical issues or have solutions to the problems documented here, please contribute to this documentation by submitting a pull request with evidence and sources.
