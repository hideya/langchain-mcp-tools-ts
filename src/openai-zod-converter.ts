import { z } from 'zod';

/**
 * Converts a JSON Schema to a Zod schema with OpenAI structured outputs compatibility
 * 
 * OpenAI requires that all fields are either:
 * 1. Required (included in the required array)
 * 2. Nullable and required (using .nullable() instead of .optional())
 * 
 * This converter ensures proper handling of optional fields by making them nullable.
 */

interface JsonSchema {
  [key: string]: any;
}

interface ConversionOptions {
  name?: string;
  path?: string;
}

export function jsonSchemaToZodForOpenAI(
  schema: JsonSchema, 
  options: ConversionOptions = {}
): z.ZodType<any> {
  const { name = 'schema', path = '' } = options;
  
  return convertSchema(schema, { name, path });
}

function convertSchema(schema: JsonSchema, options: ConversionOptions): z.ZodType<any> {
  // Handle $ref references (basic support)
  if (schema.$ref) {
    // For now, fall back to z.any() for unresolved references
    // In a full implementation, you'd resolve these from the definitions
    return z.any().describe(`Reference: ${schema.$ref}`);
  }

  // Handle type arrays (like ["string", "null"])
  if (Array.isArray(schema.type)) {
    const nonNullTypes = schema.type.filter((t: string) => t !== 'null');
    const hasNull = schema.type.includes('null');
    
    if (nonNullTypes.length === 1) {
      let baseSchema = convertSingleType(nonNullTypes[0], schema, options);
      return hasNull ? baseSchema.nullable() : baseSchema;
    } else if (nonNullTypes.length > 1) {
      // Multiple types - use union (though OpenAI doesn't fully support this)
      const schemas = nonNullTypes.map(type => convertSingleType(type, schema, options));
      let unionSchema = z.union(schemas as [z.ZodType, z.ZodType, ...z.ZodType[]]);
      return hasNull ? unionSchema.nullable() : unionSchema;
    } else {
      // Only null type
      return z.null();
    }
  }

  // Handle single type
  if (schema.type) {
    return convertSingleType(schema.type, schema, options);
  }

  // Handle objects without explicit type
  if (schema.properties) {
    return convertObjectSchema(schema, options);
  }

  // Handle arrays without explicit type
  if (schema.items) {
    return convertArraySchema(schema, options);
  }

  // Fallback
  return z.any();
}

function convertSingleType(type: string, schema: JsonSchema, options: ConversionOptions): z.ZodType<any> {
  switch (type) {
    case 'string':
      return convertStringSchema(schema);
    case 'number':
      return convertNumberSchema(schema);
    case 'integer':
      return convertIntegerSchema(schema);
    case 'boolean':
      return z.boolean();
    case 'array':
      return convertArraySchema(schema, options);
    case 'object':
      return convertObjectSchema(schema, options);
    case 'null':
      return z.null();
    default:
      return z.any();
  }
}

function convertStringSchema(schema: JsonSchema): z.ZodString {
  let stringSchema = z.string();

  if (schema.description) {
    stringSchema = stringSchema.describe(schema.description);
  }

  if (schema.enum && Array.isArray(schema.enum)) {
    return z.enum(schema.enum as [string, ...string[]]);
  }

  if (typeof schema.minLength === 'number') {
    stringSchema = stringSchema.min(schema.minLength);
  }

  if (typeof schema.maxLength === 'number') {
    stringSchema = stringSchema.max(schema.maxLength);
  }

  if (schema.pattern) {
    stringSchema = stringSchema.regex(new RegExp(schema.pattern));
  }

  // Handle common formats
  if (schema.format) {
    switch (schema.format) {
      case 'email':
        stringSchema = stringSchema.email();
        break;
      case 'uri':
      case 'url':
        stringSchema = stringSchema.url();
        break;
      case 'uuid':
        stringSchema = stringSchema.uuid();
        break;
      case 'date-time':
        stringSchema = stringSchema.datetime();
        break;
      // Add more formats as needed
    }
  }

  return stringSchema;
}

function convertNumberSchema(schema: JsonSchema): z.ZodNumber {
  let numberSchema = z.number();

  if (schema.description) {
    numberSchema = numberSchema.describe(schema.description);
  }

  if (typeof schema.minimum === 'number') {
    numberSchema = numberSchema.min(schema.minimum);
  }

  if (typeof schema.maximum === 'number') {
    numberSchema = numberSchema.max(schema.maximum);
  }

  // Handle exclusive bounds by adjusting slightly
  if (typeof schema.exclusiveMinimum === 'number') {
    numberSchema = numberSchema.min(schema.exclusiveMinimum + 0.0001);
  }

  if (typeof schema.exclusiveMaximum === 'number') {
    numberSchema = numberSchema.max(schema.exclusiveMaximum - 0.0001);
  }

  return numberSchema;
}

function convertIntegerSchema(schema: JsonSchema): z.ZodNumber {
  let intSchema = z.number().int();

  if (schema.description) {
    intSchema = intSchema.describe(schema.description);
  }

  if (typeof schema.minimum === 'number') {
    intSchema = intSchema.min(schema.minimum);
  }

  if (typeof schema.maximum === 'number') {
    intSchema = intSchema.max(schema.maximum);
  }

  // Handle exclusive bounds for integers
  if (typeof schema.exclusiveMinimum === 'number') {
    intSchema = intSchema.min(Math.ceil(schema.exclusiveMinimum + 1));
  }

  if (typeof schema.exclusiveMaximum === 'number') {
    intSchema = intSchema.max(Math.floor(schema.exclusiveMaximum - 1));
  }

  return intSchema;
}

function convertArraySchema(schema: JsonSchema, options: ConversionOptions): z.ZodArray<any> {
  let itemSchema: z.ZodType<any> = z.any();

  if (schema.items) {
    itemSchema = convertSchema(schema.items, {
      ...options,
      path: `${options.path}.items`
    });
  }

  let arraySchema = z.array(itemSchema);

  if (schema.description) {
    arraySchema = arraySchema.describe(schema.description);
  }

  if (typeof schema.minItems === 'number') {
    arraySchema = arraySchema.min(schema.minItems);
  }

  if (typeof schema.maxItems === 'number') {
    arraySchema = arraySchema.max(schema.maxItems);
  }

  return arraySchema;
}

function convertObjectSchema(schema: JsonSchema, options: ConversionOptions): z.ZodObject<any> {
  const shape: Record<string, z.ZodType<any>> = {};
  const required = new Set(schema.required || []);

  if (schema.properties) {
    for (const [propName, propSchema] of Object.entries(schema.properties)) {
      const propPath = `${options.path}.${propName}`;
      let propZodSchema = convertSchema(propSchema as JsonSchema, {
        ...options,
        path: propPath
      });

      // **KEY FIX FOR OPENAI**: Handle optional fields
      if (!required.has(propName)) {
        // For OpenAI compatibility, make optional fields nullable instead of optional
        propZodSchema = propZodSchema.nullable();
        // Note: We don't use .optional() because OpenAI doesn't support it
      }

      shape[propName] = propZodSchema;
    }
  }

  let objectSchema = z.object(shape);

  if (schema.description) {
    objectSchema = objectSchema.describe(schema.description);
  }

  // OpenAI requires strict mode (no additional properties)
  objectSchema = objectSchema.strict();

  return objectSchema;
}

/**
 * Helper function to validate that a Zod schema is compatible with OpenAI structured outputs
 */
export function validateZodSchemaForOpenAI(schema: z.ZodType<any>, path = ''): string[] {
  const errors: string[] = [];

  // This is a simplified validation - in practice, you'd need to traverse the Zod schema
  // and check for incompatible constructs like .optional() without .nullable()
  
  // For now, we'll just provide a basic check
  const schemaString = schema.toString();
  
  if (schemaString.includes('.optional()') && !schemaString.includes('.nullable()')) {
    errors.push(`Schema at ${path} may contain .optional() without .nullable() which is not supported by OpenAI`);
  }

  return errors;
}

/**
 * Alternative approach: Create a wrapper that ensures all optional fields are nullable
 */
export function ensureOpenAICompatibility<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>
): z.ZodObject<any> {
  const originalShape = schema.shape;
  const newShape: Record<string, z.ZodType<any>> = {};

  for (const [key, zodType] of Object.entries(originalShape)) {
    if (zodType instanceof z.ZodOptional) {
      // Convert .optional() to .nullable() for OpenAI compatibility
      newShape[key] = zodType.unwrap().nullable();
    } else {
      newShape[key] = zodType;
    }
  }

  return z.object(newShape).strict();
}

/**
 * Utility to recursively transform a Zod schema to be OpenAI compatible
 * This handles nested objects and arrays
 */
export function transformZodSchemaForOpenAI(schema: z.ZodType<any>): z.ZodType<any> {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const newShape: Record<string, z.ZodType<any>> = {};

    for (const [key, zodType] of Object.entries(shape)) {
      newShape[key] = transformZodSchemaForOpenAI(zodType);
    }

    return z.object(newShape).strict();
  }

  if (schema instanceof z.ZodArray) {
    const elementSchema = transformZodSchemaForOpenAI(schema.element);
    let arraySchema = z.array(elementSchema);
    
    // Preserve array constraints
    const minLength = (schema as any)._def.minLength;
    const maxLength = (schema as any)._def.maxLength;
    
    if (minLength !== null) {
      arraySchema = arraySchema.min(minLength.value);
    }
    if (maxLength !== null) {
      arraySchema = arraySchema.max(maxLength.value);
    }
    
    return arraySchema;
  }

  if (schema instanceof z.ZodOptional) {
    // Convert .optional() to .nullable() for OpenAI compatibility
    return transformZodSchemaForOpenAI(schema.unwrap()).nullable();
  }

  if (schema instanceof z.ZodUnion) {
    // Handle unions (though OpenAI has limited support)
    const options = schema.options.map((option: z.ZodType<any>) => 
      transformZodSchemaForOpenAI(option)
    );
    return z.union(options as [z.ZodType, z.ZodType, ...z.ZodType[]]);
  }

  // For other types, return as-is
  return schema;
}