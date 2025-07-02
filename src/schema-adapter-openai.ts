/**
 * Transforms a JSON Schema to be compatible with OpenAI's function calling requirements
 * Used for converting MCP tool schemas to OpenAI function declarations
 * 
 * OpenAI requires that all optional fields must also be nullable.
 * This function processes the raw JSON schema before converting it to Zod
 * to ensure compatibility.
 * 
 * The official document recommends using strict mode, but this function only
 * addresses the aforementioned requirement that generates runtime warnings.
 * 
 * For OpenAI function calling requirements:
 *    see: https://platform.openai.com/docs/guides/function-calling
 * For OpenAI structured outputs:
 *    see: https://platform.openai.com/docs/guides/structured-outputs
 */
export function makeJsonSchemaOpenAICompatible(schema: any): any {
  return transformSchemaInternal(schema);
}

function transformSchemaInternal(schema: any): any {
  if (typeof schema !== "object" || schema === null) {
    return schema;
  }

  const result = { ...schema };

  // Handle object properties
  if (result.properties) {
    const processedProperties: Record<string, any> = {};
    const required = new Set(result.required || []);

    for (const [key, propSchema] of Object.entries(result.properties)) {
      const processedProp = transformSchemaInternal(propSchema);
      
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
    result.anyOf = result.anyOf.map((subSchema: any) => transformSchemaInternal(subSchema));
  }
  
  if (result.oneOf) {
    result.oneOf = result.oneOf.map((subSchema: any) => transformSchemaInternal(subSchema));
  }
  
  if (result.allOf) {
    result.allOf = result.allOf.map((subSchema: any) => transformSchemaInternal(subSchema));
  }

  // Handle array items
  if (result.items) {
    if (Array.isArray(result.items)) {
      result.items = result.items.map(transformSchemaInternal);
    } else {
      result.items = transformSchemaInternal(result.items);
    }
  }

  // Handle additionalProperties
  if (result.additionalProperties && typeof result.additionalProperties === "object") {
    result.additionalProperties = transformSchemaInternal(result.additionalProperties);
  }

  // Handle definitions (common in complex schemas)
  if (result.definitions || result.$defs) {
    const defsKey = result.definitions ? 'definitions' : '$defs';
    const processedDefs: Record<string, any> = {};
    
    for (const [key, defSchema] of Object.entries(result[defsKey])) {
      processedDefs[key] = transformSchemaInternal(defSchema);
    }
    
    result[defsKey] = processedDefs;
  }

  return result;
}
