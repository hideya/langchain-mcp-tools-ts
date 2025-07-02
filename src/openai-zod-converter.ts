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
 * SIMPLIFIED: Safe transformation that only converts .optional() to .nullable()
 * This is much safer than the recursive approach and avoids corruption issues
 */
export function safeTransformZodForOpenAI(schema: z.ZodType<any>): z.ZodType<any> {
  // Only handle the most common case: ZodOptional -> ZodNullable
  if (schema instanceof z.ZodOptional) {
    return schema.unwrap().nullable();
  }
  
  // For ZodObject, only transform the top-level optional fields
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const newShape: Record<string, z.ZodType<any>> = {};
    let hasChanges = false;

    for (const [key, zodType] of Object.entries(shape)) {
      if (zodType instanceof z.ZodOptional) {
        newShape[key] = zodType.unwrap().nullable();
        hasChanges = true;
      } else {
        newShape[key] = zodType;
      }
    }

    if (hasChanges) {
      return z.object(newShape).strict();
    }
  }

  // Return original schema if no transformation needed
  return schema;
}

/**
 * DEPRECATED: The original recursive transformer - causes issues
 * Keeping for reference but should not be used
 */
export function transformZodSchemaForOpenAI(schema: z.ZodType<any>): z.ZodType<any> {
  // This function is deprecated due to recursion issues
  // Use safeTransformZodForOpenAI instead
  return safeTransformZodForOpenAI(schema);
}
