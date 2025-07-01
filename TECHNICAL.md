# Technical Documentation

This document captures deep technical issues encountered during the implementation of this library, along with solutions and industry context.

## 1. LLM Provider Schema Compatibility Issue

- **OpenAI requires**: `required: true` + `nullable: true` (via union types)
- **Google Gemini API**: Often rejects `nullable: true` (especially in function calling)
- **Google Vertex AI**: Does support `nullable: true` in many contexts

The incompatibility exists primarily between:
- OpenAI's structured outputs approach
- Google's Gemini API (not Vertex AI) function calling schemas

This does create challenges for developers trying to create universal schemas that work across both OpenAI and Google Gemini API.
It is problematic to create a single schema that fully satisfies both providers' strictest requirements.
- Schema Attribute Support Hierarchy
  ```
  Most Restrictive:  Gemini API
                        ↓
  More Permissive:   Vertex AI Native API  
                        ↓
  Most Permissive:   Vertex AI OpenAI-compatible endpoint
  ```

- Gemini API: Designed for developers, easy setup, simple pricing
- Vertex AI: Enterprise platform, more features, GCP integration, enterprise billing

