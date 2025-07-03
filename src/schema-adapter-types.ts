/**
 * JSON Schema Draft 7 interface definition.
 * 
 * The official MCP specification uses JSON Schema Draft 7
 * 
 * References:
 * - MCP specification: https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/schema/2025-06-18/schema.json
 * - JSON Schema Draft 7: https://json-schema.org/draft-07
 */
export interface JsonSchemaDraft7 {
  // JSON Schema core
  $schema?: string;
  $id?: string;
  $ref?: string;
  $defs?: Record<string, JsonSchemaDraft7>;
  definitions?: Record<string, JsonSchemaDraft7>;
  
  // Type definitions
  type?: string | string[];
  format?: string;
  
  // Object properties
  properties?: Record<string, JsonSchemaDraft7>;
  required?: string[];
  additionalProperties?: boolean | JsonSchemaDraft7;
  patternProperties?: Record<string, JsonSchemaDraft7>;
  
  // Array properties  
  items?: JsonSchemaDraft7 | JsonSchemaDraft7[];
  minItems?: number;
  maxItems?: number;
  
  // String properties
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  
  // Number properties
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number | boolean;
  exclusiveMaximum?: number | boolean;
  
  // Composition
  anyOf?: JsonSchemaDraft7[];
  oneOf?: JsonSchemaDraft7[];
  allOf?: JsonSchemaDraft7[];
  not?: JsonSchemaDraft7;
  
  // Validation
  enum?: unknown[];
  const?: unknown;
  
  // Metadata
  title?: string;
  description?: string;
  default?: unknown;
  examples?: unknown[];
  nullable?: boolean;
  
  // Allow additional properties for flexibility
  [key: string]: unknown;
}

export interface TransformResult {
  schema: JsonSchemaDraft7;
  wasTransformed: boolean;
  changesSummary?: string;
}
