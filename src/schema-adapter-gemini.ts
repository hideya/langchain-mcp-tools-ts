/**
 * Transforms a JSON Schema to be compatible with Gemini's OpenAPI 3.0 subset
 * Used for converting MCP tool schemas to Gemini function declarations
 * 
 * The changes are mostly cosmetic/validation-level and shouldn't break core
 * tool functionality:
 * - Core parameter structure is preserved
 * - Required fields are maintained
 * - Basic types are converted accurately
 * 
 * For the OpenAPI subset requirement for function declarations
 *    see: https://ai.google.dev/api/caching#Schema
 * 
 * For the OpenAPI 3.0 subset limitations vs full JSON Schema
 *    see: https://ai.google.dev/gemini-api/docs/structured-output
 */

interface JsonSchema {
  [key: string]: any;
}

interface GeminiCompatibleSchema {
  type?: string;
  format?: string;
  description?: string;
  nullable?: boolean;
  enum?: string[];
  maxItems?: number;
  minItems?: number;
  properties?: Record<string, GeminiCompatibleSchema>;
  required?: string[];
  propertyOrdering?: string[];
  items?: GeminiCompatibleSchema;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  example?: any;
  anyOf?: GeminiCompatibleSchema[];
  default?: any;
}

export function makeJsonSchemaGeminiCompatible(
  schema: JsonSchema,
  defsContext: Record<string, JsonSchema> = {}
): GeminiCompatibleSchema {
  // Handle $ref by resolving definitions
  if (schema.$ref) {
    const refPath = schema.$ref.replace('#/$defs/', '').replace('#/definitions/', '');
    const resolvedSchema = defsContext[refPath];
    if (resolvedSchema) {
      return makeJsonSchemaGeminiCompatible(resolvedSchema, defsContext);
    }
    // If can't resolve, return a generic object
    return { type: 'object', description: `Reference: ${schema.$ref}` };
  }

  // Extract and merge $defs into context for resolution
  if (schema.$defs || schema.definitions) {
    const defs = schema.$defs || schema.definitions;
    Object.assign(defsContext, defs);
  }

  const result: GeminiCompatibleSchema = {};

  // Handle type arrays (e.g., ["string", "null"]) -> convert to single type + nullable
  if (Array.isArray(schema.type)) {
    const nonNullTypes = schema.type.filter((t: string) => t !== 'null');
    const hasNull = schema.type.includes('null');
    
    if (nonNullTypes.length === 1) {
      result.type = nonNullTypes[0];
      if (hasNull) {
        result.nullable = true;
      }
    } else if (nonNullTypes.length > 1) {
      // Multiple non-null types -> use anyOf
      result.anyOf = nonNullTypes.map((type: string) => ({ type }));
      if (hasNull) {
        result.nullable = true;
      }
    } else {
      // Only null type
      result.type = 'string';
      result.nullable = true;
    }
  } else if (schema.type) {
    result.type = schema.type;
  }

  // Copy basic supported fields
  if (schema.description) result.description = schema.description;
  if (schema.enum) result.enum = schema.enum;
  if (schema.nullable !== undefined) result.nullable = schema.nullable;
  if (schema.example !== undefined) result.example = schema.example;
  if (schema.default !== undefined) result.default = schema.default;
  if (schema.pattern) result.pattern = schema.pattern;

  // Handle format field - filter unsupported formats
  if (schema.format) {
    if (result.type === 'string') {
      // Only allow supported string formats for Gemini
      if (['enum', 'date-time'].includes(schema.format)) {
        result.format = schema.format;
      }
      // Drop unsupported string formats (uri, uuid, url, email, etc.)
    } else if (result.type === 'number') {
      // Only allow supported number formats
      if (['float', 'double'].includes(schema.format)) {
        result.format = schema.format;
      }
    } else if (result.type === 'integer') {
      // Only allow supported integer formats
      if (['int32', 'int64'].includes(schema.format)) {
        result.format = schema.format;
      }
    }
    // For other types, don't set format
  }

  // Handle numeric constraints - convert exclusive to inclusive
  if (typeof schema.minimum === 'number') {
    result.minimum = schema.minimum;
  }
  if (typeof schema.exclusiveMinimum === 'number') {
    // Convert exclusive to inclusive (approximate)
    result.minimum = schema.exclusiveMinimum + (Number.isInteger(schema.exclusiveMinimum) ? 1 : 0.0001);
  }
  if (typeof schema.maximum === 'number') {
    result.maximum = schema.maximum;
  }
  if (typeof schema.exclusiveMaximum === 'number') {
    // Convert exclusive to inclusive (approximate)
    result.maximum = schema.exclusiveMaximum - (Number.isInteger(schema.exclusiveMaximum) ? 1 : 0.0001);
  }

  // Handle string constraints
  if (typeof schema.minLength === 'number') result.minLength = schema.minLength;
  if (typeof schema.maxLength === 'number') result.maxLength = schema.maxLength;

  // Handle array constraints
  if (typeof schema.minItems === 'number') result.minItems = schema.minItems;
  if (typeof schema.maxItems === 'number') result.maxItems = schema.maxItems;
  if (schema.items) {
    result.items = makeJsonSchemaGeminiCompatible(schema.items, defsContext);
  }

  // Handle object properties
  if (schema.properties) {
    result.properties = {};
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      result.properties[key] = makeJsonSchemaGeminiCompatible(propSchema as JsonSchema, defsContext);
    }
  }

  if (Array.isArray(schema.required)) {
    result.required = schema.required;
  }

  // Handle anyOf (supported) but convert allOf/oneOf to anyOf
  if (schema.anyOf) {
    result.anyOf = schema.anyOf.map((s: JsonSchema) => 
      makeJsonSchemaGeminiCompatible(s, defsContext)
    );
  } else if (schema.allOf) {
    // Convert allOf to object merge (best effort)
    const merged: JsonSchema = { type: 'object' };
    for (const subSchema of schema.allOf) {
      Object.assign(merged, subSchema);
      if (subSchema.properties) {
        merged.properties = { ...merged.properties, ...subSchema.properties };
      }
      if (subSchema.required) {
        merged.required = [...(merged.required || []), ...subSchema.required];
      }
    }
    return makeJsonSchemaGeminiCompatible(merged, defsContext);
  } else if (schema.oneOf) {
    // Convert oneOf to anyOf (less strict)
    result.anyOf = schema.oneOf.map((s: JsonSchema) => 
      makeJsonSchemaGeminiCompatible(s, defsContext)
    );
  }

  // Remove unsupported fields that might cause errors
  const unsupportedFields = [
    '$schema', '$id', '$ref', '$defs', 'definitions', 
    'exclusiveMinimum', 'exclusiveMaximum', 'additionalProperties', 
    'patternProperties', 'dependencies', 'if', 'then', 'else',
    'allOf', 'oneOf', 'not', 'const', 'contains', 'unevaluatedProperties'
  ];

  // Ensure we don't pass through any unsupported fields
  for (const field of unsupportedFields) {
    delete (result as any)[field];
  }

  return result;
}

/**
 * Specifically transforms MCP tool schemas for Gemini function declarations
 */
export function transformMcpToolForGemini(mcpTool: any) {
  const functionDeclaration = {
    name: mcpTool.name,
    description: mcpTool.description,
    parameters: makeJsonSchemaGeminiCompatible(mcpTool.inputSchema || {})
  };

  // Ensure parameters has a type if not set
  if (!functionDeclaration.parameters.type) {
    functionDeclaration.parameters.type = 'object';
  }

  return functionDeclaration;
}

/**
 * Utility to validate that a schema only uses Gemini-supported fields
 */
export function validateGeminiSchema(schema: any, path = ''): string[] {
  const errors: string[] = [];
  const supportedFields = new Set([
    'type', 'format', 'description', 'nullable', 'enum', 'maxItems', 
    'minItems', 'properties', 'required', 'propertyOrdering', 'items',
    'minimum', 'maximum', 'minLength', 'maxLength', 'pattern', 
    'example', 'anyOf', 'default'
  ]);

  for (const [key, value] of Object.entries(schema)) {
    const currentPath = path ? `${path}.${key}` : key;
    
    if (!supportedFields.has(key)) {
      errors.push(`Unsupported field '${key}' at ${currentPath}`);
    }

    // Recursively validate nested schemas
    if (key === 'properties' && typeof value === 'object') {
      for (const [propKey, propValue] of Object.entries(value as any)) {
        errors.push(...validateGeminiSchema(propValue, `${currentPath}.${propKey}`));
      }
    } else if (key === 'items' && typeof value === 'object') {
      errors.push(...validateGeminiSchema(value, `${currentPath}.items`));
    } else if (key === 'anyOf' && Array.isArray(value)) {
      value.forEach((item, index) => {
        errors.push(...validateGeminiSchema(item, `${currentPath}[${index}]`));
      });
    }
  }

  return errors;
}
