/**
 * Transforms a JSON Schema to be compatible with Gemini's OpenAPI 3.0 subset
 * Used for converting MCP tool schemas to Gemini function declarations
 * 
 * The changes are mostly structural/validation-level and shouldn't break core
 * tool functionality:
 * - Core parameter structure is preserved
 * - Valid required fields are maintained (invalid ones are filtered out)
 * - Basic types are converted accurately
 * - anyOf variants are individually validated and fixed
 * 
 * Key transformations for Gemini compatibility:
 * - Filters required fields that don't exist in properties
 * - Ensures anyOf variants follow Gemini's strict validation rules
 * - Removes unsupported JSON Schema features
 * - Converts type arrays to nullable single types where possible
 * 
 * For the OpenAPI subset requirement for function declarations
 *    see: https://ai.google.dev/api/caching#Schema
 * For the OpenAPI 3.0 subset limitations vs full JSON Schema
 *    see: https://ai.google.dev/gemini-api/docs/structured-output
 */

import { JsonSchemaDraft7, TransformResult } from "./schema-adapter-types.js";

type JsonSchema = JsonSchemaDraft7;
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
  example?: unknown;
  anyOf?: GeminiCompatibleSchema[];
  default?: unknown;
}

interface TransformationTracker {
  fieldsRemoved: string[];
  fieldsConverted: string[];
  referencesResolved: number;
  typeArraysConverted: number;
  formatsRemoved: string[];
  exclusiveBoundsConverted: number;
  requiredFieldsFiltered: number;
  anyOfVariantsFixed: number;
}

export function makeJsonSchemaGeminiCompatible(
  schema: JsonSchema,
  defsContext: Record<string, JsonSchema> = {}
): TransformResult {
  const tracker: TransformationTracker = {
    fieldsRemoved: [],
    fieldsConverted: [],
    referencesResolved: 0,
    typeArraysConverted: 0,
    formatsRemoved: [],
    exclusiveBoundsConverted: 0,
    requiredFieldsFiltered: 0,
    anyOfVariantsFixed: 0,
  };

  const result = transformSchemaInternal(schema, defsContext, tracker);
  
  return {
    schema: result as JsonSchema,
    wasTransformed: getTotalChanges(tracker) > 0,
    changesSummary: generateChangesSummary(tracker),
  };
}

/**
 * Validates that required fields only reference properties that actually exist
 * This addresses the core Gemini validation error you're experiencing
 */
function validateAndFilterRequired(
  required: string[] | undefined,
  properties: Record<string, GeminiCompatibleSchema> | undefined,
  tracker: TransformationTracker
): string[] | undefined {
  if (!required || !Array.isArray(required)) {
    return required;
  }
  
  if (!properties) {
    // If no properties but required exists, remove required entirely
    if (required.length > 0) {
      tracker.requiredFieldsFiltered += required.length;
    }
    return undefined;
  }
  
  const validRequired = required.filter(fieldName => 
    Object.hasOwn(properties, fieldName)
  );
  const filteredCount = required.length - validRequired.length;
  
  if (filteredCount > 0) {
    tracker.requiredFieldsFiltered += filteredCount;
  }
  
  return validRequired.length > 0 ? validRequired : undefined;
}

/**
 * Ensures each anyOf variant is independently valid according to Gemini rules
 */
function transformAnyOfVariants(
  anyOf: JsonSchema[],
  defsContext: Record<string, JsonSchema>,
  tracker: TransformationTracker
): GeminiCompatibleSchema[] {
  return anyOf.map((variant) => {
    const transformedVariant = transformSchemaInternal(variant, defsContext, tracker);
    
    // Special validation for anyOf variants
    if (transformedVariant.type === 'object' && transformedVariant.required) {
      const originalRequired = transformedVariant.required;
      transformedVariant.required = validateAndFilterRequired(
        transformedVariant.required,
        transformedVariant.properties,
        tracker
      );
      
      if (originalRequired && originalRequired.length !== (transformedVariant.required?.length || 0)) {
        tracker.anyOfVariantsFixed++;
      }
    }
    
    return transformedVariant;
  });
}

function transformSchemaInternal(
  schema: JsonSchema,
  defsContext: Record<string, JsonSchema>,
  tracker: TransformationTracker
): GeminiCompatibleSchema {
  // Handle $ref by resolving definitions
  if (schema.$ref) {
    const refPath = schema.$ref.replace('#/$defs/', '').replace('#/definitions/', '');
    const resolvedSchema = defsContext[refPath];
    if (resolvedSchema) {
      tracker.referencesResolved++;
      return transformSchemaInternal(resolvedSchema, defsContext, tracker);
    }
    // If can't resolve, return a generic object
    tracker.fieldsConverted.push(`$ref (unresolved): ${schema.$ref}`);
    return { type: 'object', description: `Reference: ${schema.$ref}` };
  }

  // Extract and merge $defs into context for resolution
  if (schema.$defs || schema.definitions) {
    const defs = schema.$defs || schema.definitions;
    Object.assign(defsContext, defs);
    tracker.fieldsRemoved.push('$defs/definitions');
  }

  const result: GeminiCompatibleSchema = {};

  // Handle type arrays (e.g., ["string", "null"]) -> convert to single type + nullable
  if (Array.isArray(schema.type)) {
    tracker.typeArraysConverted++;
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

  // Handle format field - filter unsupported formats
  if (schema.format) {
    if (result.type === 'string') {
      // Only allow supported string formats for Gemini
      if (['enum', 'date-time'].includes(schema.format)) {
        result.format = schema.format;
      } else {
        tracker.formatsRemoved.push(`${schema.format} (string)`);
      }
    } else if (result.type === 'number') {
      // Only allow supported number formats
      if (['float', 'double'].includes(schema.format)) {
        result.format = schema.format;
      } else {
        tracker.formatsRemoved.push(`${schema.format} (number)`);
      }
    } else if (result.type === 'integer') {
      // Only allow supported integer formats
      if (['int32', 'int64'].includes(schema.format)) {
        result.format = schema.format;
      } else {
        tracker.formatsRemoved.push(`${schema.format} (integer)`);
      }
    } else {
      tracker.formatsRemoved.push(`${schema.format} (${result.type})`);
    }
  }

  // Copy other basic supported fields
  if (schema.description) result.description = schema.description;
  // Copy enum only if it's a string array since Gemini can't handle others
  if (schema.enum && Array.isArray(schema.enum) && schema.enum.every(item => typeof item === 'string')) {
    result.enum = schema.enum as string[];
  }
  if (schema.nullable !== undefined) result.nullable = schema.nullable;
  if (schema.example !== undefined) result.example = schema.example;
  if (schema.default !== undefined) result.default = schema.default;
  if (schema.pattern) result.pattern = schema.pattern;

  // Handle numeric constraints - convert exclusive to inclusive
  if (typeof schema.minimum === 'number') {
    result.minimum = schema.minimum;
  }
  if (typeof schema.exclusiveMinimum === 'number') {
    tracker.exclusiveBoundsConverted++;
    // Convert exclusive to inclusive (approximate)
    result.minimum = schema.exclusiveMinimum + (Number.isInteger(schema.exclusiveMinimum) ? 1 : 0.0001);
  }
  if (typeof schema.maximum === 'number') {
    result.maximum = schema.maximum;
  }
  if (typeof schema.exclusiveMaximum === 'number') {
    tracker.exclusiveBoundsConverted++;
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
    if (Array.isArray(schema.items)) {
      // Handle array case - maybe take first item or merge
      if (schema.items.length > 0) {
        result.items = transformSchemaInternal(schema.items[0], defsContext, tracker);
      }
    } else {
      // Handle single schema case
      result.items = transformSchemaInternal(schema.items, defsContext, tracker);
    }
  }

  // Handle object properties
  if (schema.properties) {
    result.properties = {};
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      result.properties[key] = transformSchemaInternal(propSchema as JsonSchema, defsContext, tracker);
    }
  }

  // CRITICAL FIX: Validate required fields against actual properties
  if (Array.isArray(schema.required)) {
    result.required = validateAndFilterRequired(schema.required, result.properties, tracker);
  }

  // Handle anyOf (supported) but convert allOf/oneOf to anyOf
  if (schema.anyOf) {
    result.anyOf = transformAnyOfVariants(schema.anyOf, defsContext, tracker);
  } else if (schema.allOf) {
    tracker.fieldsConverted.push('allOf → object merge');
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
    return transformSchemaInternal(merged, defsContext, tracker);
  } else if (schema.oneOf) {
    tracker.fieldsConverted.push('oneOf → anyOf');
    // Convert oneOf to anyOf (less strict)
    result.anyOf = transformAnyOfVariants(schema.oneOf, defsContext, tracker);
  }

  // Track removal of unsupported fields
  const unsupportedFields = [
    '$schema', '$id', '$ref', '$defs', 'definitions', 
    'exclusiveMinimum', 'exclusiveMaximum', 'additionalProperties', 
    'patternProperties', 'dependencies', 'if', 'then', 'else',
    'allOf', 'oneOf', 'not', 'const', 'contains', 'unevaluatedProperties'
  ];

  for (const field of unsupportedFields) {
    if (schema[field] !== undefined && !['allOf', 'oneOf', 'exclusiveMinimum', 'exclusiveMaximum', '$defs', 'definitions', '$ref'].includes(field)) {
      tracker.fieldsRemoved.push(field);
    }
  }

  return result;
}

function getTotalChanges(tracker: TransformationTracker): number {
  return tracker.fieldsRemoved.length + 
         tracker.fieldsConverted.length + 
         tracker.referencesResolved + 
         tracker.typeArraysConverted + 
         tracker.formatsRemoved.length + 
         tracker.exclusiveBoundsConverted +
         tracker.requiredFieldsFiltered +
         tracker.anyOfVariantsFixed;
}

function generateChangesSummary(tracker: TransformationTracker): string {
  const changes: string[] = [];
  
  if (tracker.referencesResolved > 0) {
    changes.push(`${tracker.referencesResolved} reference(s) resolved`);
  }
  
  if (tracker.typeArraysConverted > 0) {
    changes.push(`${tracker.typeArraysConverted} type array(s) converted`);
  }
  
  if (tracker.exclusiveBoundsConverted > 0) {
    changes.push(`${tracker.exclusiveBoundsConverted} exclusive bound(s) converted`);
  }
  
  if (tracker.requiredFieldsFiltered > 0) {
    changes.push(`${tracker.requiredFieldsFiltered} invalid required field(s) filtered`);
  }
  
  if (tracker.anyOfVariantsFixed > 0) {
    changes.push(`${tracker.anyOfVariantsFixed} anyOf variant(s) fixed`);
  }
  
  if (tracker.formatsRemoved.length > 0) {
    const formatTypes = [...new Set(tracker.formatsRemoved.map(f => f.split(' ')[0]))];
    changes.push(`${tracker.formatsRemoved.length} unsupported format(s) removed (${formatTypes.slice(0, 3).join(', ')}${formatTypes.length > 3 ? '...' : ''})`);
  }
  
  if (tracker.fieldsConverted.length > 0) {
    changes.push(`${tracker.fieldsConverted.length} field(s) converted (${tracker.fieldsConverted.slice(0, 2).join(', ')}${tracker.fieldsConverted.length > 2 ? '...' : ''})`);
  }
  
  if (tracker.fieldsRemoved.length > 0) {
    const removedTypes = [...new Set(tracker.fieldsRemoved)];
    changes.push(`${tracker.fieldsRemoved.length} unsupported field(s) removed (${removedTypes.slice(0, 3).join(', ')}${removedTypes.length > 3 ? '...' : ''})`);
  }
  
  if (changes.length === 0) {
    return '';
  }
  
  return changes.join(', ');
}

/**
 * Specifically transforms MCP tool schemas for Gemini function declarations
 */
export function transformMcpToolForGemini(mcpTool: { name: string; description?: string; inputSchema?: JsonSchema }) {
  const transformResult = makeJsonSchemaGeminiCompatible(mcpTool.inputSchema || {});
  
  const functionDeclaration = {
    name: mcpTool.name,
    description: mcpTool.description,
    parameters: transformResult.schema
  };

  // Ensure parameters has a type if not set
  if (!functionDeclaration.parameters.type) {
    functionDeclaration.parameters.type = 'object';
  }

  return {
    functionDeclaration,
    wasTransformed: transformResult.wasTransformed,
    changesSummary: transformResult.changesSummary
  };
}

/**
 * Enhanced utility to validate that a schema only uses Gemini-supported fields
 * and follows all Gemini validation rules
 */
export function validateGeminiSchema(schema: GeminiCompatibleSchema, path = ''): string[] {
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

    // Enhanced validation: Check required vs properties consistency
    if (key === 'required' && Array.isArray(value) && schema.properties) {
      const invalidRequired = value.filter(reqField => !Object.hasOwn(schema.properties!, reqField));
      if (invalidRequired.length > 0) {
        errors.push(`Required field(s) [${invalidRequired.join(', ')}] not found in properties at ${currentPath}`);
      }
    }

    // Enhanced validation: Required only allowed for object type
    if (key === 'required' && schema.type !== 'object') {
      errors.push(`Required field only allowed for object type, found ${schema.type} at ${currentPath}`);
    }

    // Recursively validate nested schemas
    if (key === 'properties' && typeof value === 'object') {
      for (const [propKey, propValue] of Object.entries(value as Record<string, GeminiCompatibleSchema>)) {
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
