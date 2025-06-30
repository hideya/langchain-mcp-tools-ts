/**
 * Recursively transforms a JSON Schema to be compatible with OpenAI's Structured Outputs requirements.
 * 
 * OpenAI requires that all optional properties must also be nullable. This function finds
 * properties that are optional (not in required array) and ensures they include "null" in their type.
 * 
 * @param schema - The JSON Schema to transform
 * @returns A new JSON Schema with optional fields made nullable
 */
export function makeJsonSchemaOpenAICompatible(schema: any): any {
  if (typeof schema !== "object" || schema === null) {
    return schema;
  }

  const result = { ...schema };

  // Handle object schemas with properties
  if (result.type === "object" && result.properties) {
    const required = new Set(result.required || []);
    const newProperties: any = {};

    for (const [propName, propSchema] of Object.entries(result.properties)) {
      const isRequired = required.has(propName);
      let processedSchema = makeJsonSchemaOpenAICompatible(propSchema);

      // If property is not required (i.e., optional), make it nullable
      if (!isRequired) {
        processedSchema = makePropertyNullable(processedSchema);
      }

      newProperties[propName] = processedSchema;
    }

    result.properties = newProperties;
  }

  // Handle arrays
  if (result.type === "array" && result.items) {
    result.items = makeJsonSchemaOpenAICompatible(result.items);
  }

  // Handle anyOf (union types)
  if (result.anyOf && Array.isArray(result.anyOf)) {
    result.anyOf = result.anyOf.map((subSchema: any) => 
      makeJsonSchemaOpenAICompatible(subSchema)
    );
  }

  // Handle oneOf
  if (result.oneOf && Array.isArray(result.oneOf)) {
    result.oneOf = result.oneOf.map((subSchema: any) => 
      makeJsonSchemaOpenAICompatible(subSchema)
    );
  }

  // Handle allOf
  if (result.allOf && Array.isArray(result.allOf)) {
    result.allOf = result.allOf.map((subSchema: any) => 
      makeJsonSchemaOpenAICompatible(subSchema)
    );
  }

  // Handle additionalProperties
  if (result.additionalProperties && typeof result.additionalProperties === "object") {
    result.additionalProperties = makeJsonSchemaOpenAICompatible(result.additionalProperties);
  }

  // Handle nested definitions
  if (result.definitions) {
    const newDefinitions: any = {};
    for (const [defName, defSchema] of Object.entries(result.definitions)) {
      newDefinitions[defName] = makeJsonSchemaOpenAICompatible(defSchema);
    }
    result.definitions = newDefinitions;
  }

  // Handle $defs (newer JSON Schema draft)
  if (result.$defs) {
    const newDefs: any = {};
    for (const [defName, defSchema] of Object.entries(result.$defs)) {
      newDefs[defName] = makeJsonSchemaOpenAICompatible(defSchema);
    }
    result.$defs = newDefs;
  }

  return result;
}

/**
 * Makes a JSON Schema property nullable by adding "null" to its type.
 * Handles various schema formats (string type, array type, union types, etc.)
 */
function makePropertyNullable(schema: any): any {
  if (typeof schema !== "object" || schema === null) {
    return schema;
  }

  const result = { ...schema };

  // If already nullable, return as-is
  if (isAlreadyNullable(result)) {
    return result;
  }

  // Handle string type
  if (typeof result.type === "string") {
    result.type = [result.type, "null"];
    return result;
  }

  // Handle array type
  if (Array.isArray(result.type)) {
    if (!result.type.includes("null")) {
      result.type = [...result.type, "null"];
    }
    return result;
  }

  // Handle schemas without explicit type (treat as any type + null)
  if (!result.type && !result.anyOf && !result.oneOf && !result.allOf) {
    result.type = ["null"];
    return result;
  }

  // For complex schemas (anyOf, oneOf, etc.), wrap in anyOf with null
  if (result.anyOf || result.oneOf || result.allOf) {
    return {
      anyOf: [result, { type: "null" }]
    };
  }

  return result;
}

/**
 * Checks if a schema is already nullable
 */
function isAlreadyNullable(schema: any): boolean {
  // Check if type includes null
  if (typeof schema.type === "string" && schema.type === "null") {
    return true;
  }
  
  if (Array.isArray(schema.type) && schema.type.includes("null")) {
    return true;
  }

  // Check if anyOf/oneOf includes null type
  if (schema.anyOf && Array.isArray(schema.anyOf)) {
    return schema.anyOf.some((subSchema: any) => 
      subSchema.type === "null" || isAlreadyNullable(subSchema)
    );
  }

  if (schema.oneOf && Array.isArray(schema.oneOf)) {
    return schema.oneOf.some((subSchema: any) => 
      subSchema.type === "null" || isAlreadyNullable(subSchema)
    );
  }

  return false;
}
