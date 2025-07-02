/**
 * Transforms a JSON Schema to be compatible with OpenAI's function calling requirements
 * Used for converting MCP tool schemas to OpenAI function declarations
 * 
 * OpenAI requires that optional fields must also be nullable to avoid API errors.
 * This adapter specifically fixes the Zod-related error:
 * "Zod field uses `.optional()` without `.nullable()` which is not supported by the API"
 * 
 * This function processes the raw JSON schema before converting it to Zod
 * to ensure OpenAI compatibility by making all non-required fields nullable.
 * 
 * The official OpenAI documentation states that in structured outputs,
 * all fields must be required OR if optional, they must also be nullable.
 * 
 * For OpenAI function calling requirements:
 *    see: https://platform.openai.com/docs/guides/function-calling
 * For OpenAI structured outputs (where this constraint is documented):
 *    see: https://platform.openai.com/docs/guides/structured-outputs?api-mode=responses#all-fields-must-be-required
 */

interface TransformResult {
  schema: any;
  wasTransformed: boolean;
  changesSummary?: string;
}

interface TransformationTracker {
  nullableFieldsAdded: string[];
  anyOfNullsAdded: string[];
  oneOfNullsAdded: string[];
  nestedSchemasProcessed: number;
}

export function makeJsonSchemaOpenAICompatible(schema: any): TransformResult {
  const tracker: TransformationTracker = {
    nullableFieldsAdded: [],
    anyOfNullsAdded: [],
    oneOfNullsAdded: [],
    nestedSchemasProcessed: 0,
  };

  const result = transformSchemaInternal(schema, tracker, '');
  
  return {
    schema: result,
    wasTransformed: getTotalChanges(tracker) > 0,
    changesSummary: generateChangesSummary(tracker),
  };
}

function transformSchemaInternal(schema: any, tracker: TransformationTracker, path: string = ''): any {
  if (typeof schema !== "object" || schema === null) {
    return schema;
  }

  const result = { ...schema };

  // Handle object properties
  if (result.properties) {
    const processedProperties: Record<string, any> = {};
    const required = new Set(result.required || []);

    for (const [key, propSchema] of Object.entries(result.properties)) {
      const propPath = path ? `${path}.${key}` : key;
      const processedProp = transformSchemaInternal(propSchema, tracker, propPath);
      
      // If the field is not required, make it nullable
      if (!required.has(key)) {
        if (processedProp.type && !processedProp.nullable) {
          processedProp.nullable = true;
          tracker.nullableFieldsAdded.push(propPath);
        } else if (processedProp.anyOf && !processedProp.anyOf.some((s: any) => s.type === "null")) {
          processedProp.anyOf = [...processedProp.anyOf, { type: "null" }];
          tracker.anyOfNullsAdded.push(propPath);
        } else if (processedProp.oneOf && !processedProp.oneOf.some((s: any) => s.type === "null")) {
          processedProp.oneOf = [...processedProp.oneOf, { type: "null" }];
          tracker.oneOfNullsAdded.push(propPath);
        }
      }
      
      processedProperties[key] = processedProp;
    }
    
    result.properties = processedProperties;
  }

  // Handle anyOf/oneOf/allOf recursively
  if (result.anyOf) {
    result.anyOf = result.anyOf.map((subSchema: any, index: number) => {
      tracker.nestedSchemasProcessed++;
      return transformSchemaInternal(subSchema, tracker, `${path}.anyOf[${index}]`);
    });
  }
  
  if (result.oneOf) {
    result.oneOf = result.oneOf.map((subSchema: any, index: number) => {
      tracker.nestedSchemasProcessed++;
      return transformSchemaInternal(subSchema, tracker, `${path}.oneOf[${index}]`);
    });
  }
  
  if (result.allOf) {
    result.allOf = result.allOf.map((subSchema: any, index: number) => {
      tracker.nestedSchemasProcessed++;
      return transformSchemaInternal(subSchema, tracker, `${path}.allOf[${index}]`);
    });
  }

  // Handle array items
  if (result.items) {
    if (Array.isArray(result.items)) {
      result.items = result.items.map((item, index) => {
        tracker.nestedSchemasProcessed++;
        return transformSchemaInternal(item, tracker, `${path}.items[${index}]`);
      });
    } else {
      tracker.nestedSchemasProcessed++;
      result.items = transformSchemaInternal(result.items, tracker, `${path}.items`);
    }
  }

  // Handle additionalProperties
  if (result.additionalProperties && typeof result.additionalProperties === "object") {
    tracker.nestedSchemasProcessed++;
    result.additionalProperties = transformSchemaInternal(result.additionalProperties, tracker, `${path}.additionalProperties`);
  }

  // Handle definitions (common in complex schemas)
  if (result.definitions || result.$defs) {
    const defsKey = result.definitions ? 'definitions' : '$defs';
    const processedDefs: Record<string, any> = {};
    
    for (const [key, defSchema] of Object.entries(result[defsKey])) {
      tracker.nestedSchemasProcessed++;
      processedDefs[key] = transformSchemaInternal(defSchema, tracker, `${path}.${defsKey}.${key}`);
    }
    
    result[defsKey] = processedDefs;
  }

  return result;
}

function getTotalChanges(tracker: TransformationTracker): number {
  return tracker.nullableFieldsAdded.length + 
         tracker.anyOfNullsAdded.length + 
         tracker.oneOfNullsAdded.length;
}

function generateChangesSummary(tracker: TransformationTracker): string {
  const changes: string[] = [];
  
  if (tracker.nullableFieldsAdded.length > 0) {
    const examples = tracker.nullableFieldsAdded.slice(0, 3);
    const exampleText = examples.join(', ');
    const moreText = tracker.nullableFieldsAdded.length > 3 ? `, +${tracker.nullableFieldsAdded.length - 3} more` : '';
    changes.push(`${tracker.nullableFieldsAdded.length} field(s) made nullable (${exampleText}${moreText})`);
  }
  
  if (tracker.anyOfNullsAdded.length > 0) {
    changes.push(`${tracker.anyOfNullsAdded.length} anyOf schema(s) extended with null type`);
  }
  
  if (tracker.oneOfNullsAdded.length > 0) {
    changes.push(`${tracker.oneOfNullsAdded.length} oneOf schema(s) extended with null type`);
  }
  
  if (tracker.nestedSchemasProcessed > 0) {
    changes.push(`${tracker.nestedSchemasProcessed} nested schema(s) processed`);
  }
  
  if (changes.length === 0) {
    return '';
  }
  
  return changes.join(', ');
}
