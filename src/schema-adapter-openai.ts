/**
 * Recursively transforms a JSON Schema to be compatible with OpenAI's Structured Outputs requirements.
 * 
 * OpenAI requires that all optional fields must also be nullable. This function processes
 * the raw JSON schema before it's converted to Zod, ensuring deep compatibility.
 */
export function makeJsonSchemaOpenAICompatible(schema: any): any {
  if (typeof schema !== "object" || schema === null) {
    return schema;
  }

  const result = { ...schema };

  // Handle object properties
  if (result.properties) {
    const processedProperties: Record<string, any> = {};
    const required = new Set(result.required || []);

    for (const [key, propSchema] of Object.entries(result.properties)) {
      const processedProp = makeJsonSchemaOpenAICompatible(propSchema);
      
      // If the field is not required, make it nullable
      if (!required.has(key)) {
        if (processedProp.type && !processedProp.nullable) {
          processedProp.nullable = true;
        } else if (processedProp.anyOf && !processedProp.anyOf.some((s: any) => s.type === "null")) {
          processedProp.anyOf = [...processedProp.anyOf, { type: "null" }];
        } else if (processedProp.oneOf && !processedProp.oneOf.some((s: any) => s.type === "null")) {
          processedProp.oneOf = [...processedProp.oneOf, { type: "null" }];
        }
      }
      
      processedProperties[key] = processedProp;
    }
    
    result.properties = processedProperties;
  }

  // Handle anyOf/oneOf/allOf recursively
  if (result.anyOf) {
    result.anyOf = result.anyOf.map((subSchema: any) => makeJsonSchemaOpenAICompatible(subSchema));
  }
  
  if (result.oneOf) {
    result.oneOf = result.oneOf.map((subSchema: any) => makeJsonSchemaOpenAICompatible(subSchema));
  }
  
  if (result.allOf) {
    result.allOf = result.allOf.map((subSchema: any) => makeJsonSchemaOpenAICompatible(subSchema));
  }

  // Handle array items
  if (result.items) {
    if (Array.isArray(result.items)) {
      result.items = result.items.map(makeJsonSchemaOpenAICompatible);
    } else {
      result.items = makeJsonSchemaOpenAICompatible(result.items);
    }
  }

  // Handle additionalProperties
  if (result.additionalProperties && typeof result.additionalProperties === "object") {
    result.additionalProperties = makeJsonSchemaOpenAICompatible(result.additionalProperties);
  }

  // Handle definitions (common in complex schemas)
  if (result.definitions || result.$defs) {
    const defsKey = result.definitions ? 'definitions' : '$defs';
    const processedDefs: Record<string, any> = {};
    
    for (const [key, defSchema] of Object.entries(result[defsKey])) {
      processedDefs[key] = makeJsonSchemaOpenAICompatible(defSchema);
    }
    
    result[defsKey] = processedDefs;
  }

  return result;
}



/**
 * Transforms a JSON Schema to be compatible with OpenAI's function calling requirements
 * Used for converting MCP tool schemas to OpenAI function declarations
 * 
 * OpenAI function calling requires:
 * - strict: true for structured outputs
 * - additionalProperties: false on all object types
 * - Limited JSON Schema subset (no oneOf/allOf/anyOf/etc.)
 * - Single types only (no type arrays)
 * 
 * The changes are mostly validation-level and shouldn't break core
 * tool functionality:
 * - Core parameter structure is preserved
 * - Required fields are maintained
 * - Basic types are converted accurately
 * 
 * For OpenAI function calling requirements:
 *    see: https://platform.openai.com/docs/guides/function-calling
 * For OpenAI structured outputs:
 *    see: https://platform.openai.com/docs/guides/structured-outputs
 */
interface JsonSchema {
  [key: string]: any;
}

interface OpenAICompatibleSchema {
  type?: string;
  description?: string;
  enum?: string[] | number[];
  properties?: Record<string, OpenAICompatibleSchema>;
  required?: string[];
  items?: OpenAICompatibleSchema;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  additionalProperties?: false; // Always false for OpenAI strict mode
  minItems?: number;
  maxItems?: number;
  format?: string; // Limited support
}

interface TransformResult {
  schema: OpenAICompatibleSchema;
  wasTransformed: boolean;
  changesSummary?: string;
}

interface TransformationTracker {
  fieldsRemoved: string[];
  fieldsConverted: string[];
  referencesResolved: number;
  typeArraysConverted: number;
  formatsRemoved: string[];
  exclusiveBoundsConverted: number;
  additionalPropertiesAdded: number;
  nullableHandled: number;
}

export function XmakeJsonSchemaOpenAICompatible(
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
    additionalPropertiesAdded: 0,
    nullableHandled: 0,
  };

  const result = transformSchemaInternal(schema, defsContext, tracker);
  
  return {
    schema: result,
    wasTransformed: getTotalChanges(tracker) > 0,
    changesSummary: generateChangesSummary(tracker),
  };
}

function transformSchemaInternal(
  schema: JsonSchema,
  defsContext: Record<string, JsonSchema>,
  tracker: TransformationTracker
): OpenAICompatibleSchema {
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
    return { 
      type: 'object', 
      description: `Reference: ${schema.$ref}`,
      additionalProperties: false 
    };
  }

  // Extract and merge $defs into context for resolution
  if (schema.$defs || schema.definitions) {
    const defs = schema.$defs || schema.definitions;
    Object.assign(defsContext, defs);
    tracker.fieldsRemoved.push('$defs/definitions');
  }

  const result: OpenAICompatibleSchema = {};

  // Handle type arrays (e.g., ["string", "null"]) -> convert to single type
  if (Array.isArray(schema.type)) {
    tracker.typeArraysConverted++;
    const nonNullTypes = schema.type.filter((t: string) => t !== 'null');
    const hasNull = schema.type.includes('null');
    
    if (nonNullTypes.length === 1) {
      result.type = nonNullTypes[0];
      if (hasNull) {
        tracker.nullableHandled++;
        // OpenAI doesn't have explicit nullable, so we note this but can't represent it directly
        // In practice, the model can still return null values
      }
    } else if (nonNullTypes.length > 1) {
      // Multiple non-null types -> use first one (OpenAI doesn't support anyOf)
      result.type = nonNullTypes[0];
      tracker.fieldsConverted.push(`Multiple types [${nonNullTypes.join(', ')}] → ${nonNullTypes[0]}`);
      if (hasNull) {
        tracker.nullableHandled++;
      }
    } else {
      // Only null type -> default to string
      result.type = 'string';
      tracker.fieldsConverted.push('null-only type → string');
    }
  } else if (schema.type) {
    result.type = schema.type;
  }

  // Handle format field - only certain formats are well-supported
  if (schema.format) {
    const supportedFormats = {
      string: ['date-time', 'date', 'time', 'email', 'uri', 'uuid'],
      number: ['float', 'double'],
      integer: ['int32', 'int64']
    };
    
    const typeFormats = supportedFormats[result.type as keyof typeof supportedFormats];
    if (typeFormats && typeFormats.includes(schema.format)) {
      result.format = schema.format;
    } else {
      tracker.formatsRemoved.push(`${schema.format} (${result.type})`);
    }
  }

  // Copy other basic supported fields
  if (schema.description) result.description = schema.description;
  if (schema.enum) result.enum = schema.enum;
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
    result.items = transformSchemaInternal(schema.items, defsContext, tracker);
  }

  // Handle object properties
  if (schema.properties) {
    result.properties = {};
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      result.properties[key] = transformSchemaInternal(propSchema as JsonSchema, defsContext, tracker);
    }
  }

  if (Array.isArray(schema.required)) {
    result.required = schema.required;
  }

  // OpenAI strict mode requires additionalProperties: false on all objects
  if (result.type === 'object' || result.properties) {
    result.type = 'object';
    result.additionalProperties = false;
    tracker.additionalPropertiesAdded++;
  }

  // Handle unsupported schema combinators by converting to simpler forms
  if (schema.anyOf) {
    tracker.fieldsConverted.push('anyOf → first option');
    // Take the first option from anyOf
    const firstOption = schema.anyOf[0];
    if (firstOption) {
      const transformedFirst = transformSchemaInternal(firstOption, defsContext, tracker);
      // Merge with current result, giving priority to anyOf option
      Object.assign(result, transformedFirst);
    }
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
    tracker.fieldsConverted.push('oneOf → first option');
    // Take the first option from oneOf
    const firstOption = schema.oneOf[0];
    if (firstOption) {
      const transformedFirst = transformSchemaInternal(firstOption, defsContext, tracker);
      Object.assign(result, transformedFirst);
    }
  }

  // Track removal of unsupported fields
  const unsupportedFields = [
    '$schema', '$id', '$ref', '$defs', 'definitions', 
    'exclusiveMinimum', 'exclusiveMaximum', 'additionalProperties', 
    'patternProperties', 'dependencies', 'if', 'then', 'else',
    'allOf', 'oneOf', 'anyOf', 'not', 'const', 'contains', 
    'unevaluatedProperties', 'nullable', 'example', 'default',
    'propertyOrdering'
  ];

  for (const field of unsupportedFields) {
    if (schema[field] !== undefined && !['allOf', 'oneOf', 'anyOf', 'exclusiveMinimum', 'exclusiveMaximum', '$defs', 'definitions', '$ref', 'additionalProperties'].includes(field)) {
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
         tracker.additionalPropertiesAdded +
         tracker.nullableHandled;
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
  
  if (tracker.additionalPropertiesAdded > 0) {
    changes.push(`${tracker.additionalPropertiesAdded} object(s) made strict (additionalProperties: false)`);
  }
  
  if (tracker.nullableHandled > 0) {
    changes.push(`${tracker.nullableHandled} nullable type(s) converted`);
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
 * Specifically transforms MCP tool schemas for OpenAI function declarations
 */
export function transformMcpToolForOpenAI(mcpTool: any) {
  const transformResult = makeJsonSchemaOpenAICompatible(mcpTool.inputSchema || {});
  
  const functionDeclaration = {
    type: 'function' as const,
    function: {
      name: mcpTool.name,
      description: mcpTool.description,
      parameters: transformResult.schema,
      strict: true
    }
  };

  // Ensure parameters has a type if not set
  if (!functionDeclaration.function.parameters.type) {
    functionDeclaration.function.parameters.type = 'object';
    functionDeclaration.function.parameters.additionalProperties = false;
  }

  return {
    functionDeclaration,
    wasTransformed: transformResult.wasTransformed,
    changesSummary: transformResult.changesSummary
  };
}

/**
 * Utility to validate that a schema only uses OpenAI-supported fields
 */
export function validateOpenAISchema(schema: any, path = ''): string[] {
  const errors: string[] = [];
  const supportedFields = new Set([
    'type', 'description', 'enum', 'properties', 'required', 'items',
    'minimum', 'maximum', 'minLength', 'maxLength', 'pattern', 
    'additionalProperties', 'minItems', 'maxItems', 'format'
  ]);

  for (const [key, value] of Object.entries(schema)) {
    const currentPath = path ? `${path}.${key}` : key;
    
    if (!supportedFields.has(key)) {
      errors.push(`Unsupported field '${key}' at ${currentPath}`);
    }

    // Check for required strict mode constraints
    if (key === 'additionalProperties' && value !== false) {
      errors.push(`additionalProperties must be false for OpenAI strict mode at ${currentPath}`);
    }

    // Recursively validate nested schemas
    if (key === 'properties' && typeof value === 'object') {
      for (const [propKey, propValue] of Object.entries(value as any)) {
        errors.push(...validateOpenAISchema(propValue, `${currentPath}.${propKey}`));
      }
    } else if (key === 'items' && typeof value === 'object') {
      errors.push(...validateOpenAISchema(value, `${currentPath}.items`));
    }
  }

  // Check that object types have additionalProperties: false
  if (schema.type === 'object' && schema.additionalProperties !== false) {
    errors.push(`Object type missing 'additionalProperties: false' at ${path || 'root'}`);
  }

  return errors;
}

/**
 * Creates a complete OpenAI tool definition with proper structure
 */
export function createOpenAITool(name: string, description: string, parameters: OpenAICompatibleSchema) {
  // Ensure the parameters schema is valid for OpenAI
  if (!parameters.type) {
    parameters.type = 'object';
  }
  if (parameters.type === 'object') {
    parameters.additionalProperties = false;
  }

  return {
    type: 'function' as const,
    function: {
      name,
      description,
      parameters,
      strict: true
    }
  };
}
