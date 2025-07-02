# Technical Documentation

This document captures technical issues encountered during the implementation of this library.

## 1. LLM Provider Schema Compatibility Issue

The incompatibility exists primarily between:
- OpenAI's structured outputs approach
- Google's Gemini API (not Vertex AI) function calling schemas

- **OpenAI requires**: `required: true` + `nullable: true` (via union types)
- **Google Gemini API**: Often rejects `nullable: true` (especially in function calling)

Note that **Google Vertex AI** does support `nullable: true` in many contexts.

This creates challenges for developers trying to create universal schemas
that work across both OpenAI and Google Gemini API.
