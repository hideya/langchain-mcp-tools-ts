# Technical Documentation

This document captures technical issues encountered during the implementation of this library.

## 1. LLM Provider Schema Compatibility Issue

### Incompatibility

The incompatibility exists primarily between:
- OpenAI's structured outputs approach
- Google's Gemini API (not Vertex AI) function calling schemas

The incompatibility is:
- **OpenAI requires**: `required: true` + `nullable: true` (via union types)
- **Google Gemini API**: rejects `nullable: true` in function calling

  Note that **Google Vertex AI** provides API endpoints that support `nullable: true` (e.g. OpenAI-compatible endpoint) 

For details:
- OpenAI function calling requirements:
  https://platform.openai.com/docs/guides/function-calling

- Gemini's OpenAPI subset requirement for function declarations:
  https://ai.google.dev/api/caching#Schema

### Issue

This creates challenges for developers trying to create universal schemas
that work across both OpenAI and Google Gemini API.

In addition, there are MCP servers that has issues with those requirements/restrictions.


