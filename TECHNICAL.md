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

### Our Solution: TBD
