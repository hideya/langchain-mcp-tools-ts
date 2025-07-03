/**
 * Transforms a JSON Schema to be compatible with OpenAI's function calling requirements
 * Used for converting MCP tool schemas to OpenAI function declarations
 * 
 * OpenAI requires that optional fields must be nullable (.optional() + .nullable())
 * for function calling to avoid API errors (based on Structured Outputs API requirements,
 * strict enforcement coming in future SDK versions).
 * 
 * This adapter specifically fixes the Zod-related error:
 * "Zod field uses `.optional()` without `.nullable()` which is not supported by the API"
 * 
 * This function processes the raw JSON schema before converting it to Zod
 * to ensure OpenAI compatibility by making all non-required fields nullable.
 * 
 * The official OpenAI documentation states that in Structured Outputs,
 * all fields must be required OR if optional, they must also be nullable.
 * 
 * For OpenAI function calling requirements:
 *    see: https://platform.openai.com/docs/guides/function-calling
 * For OpenAI structured outputs (where this constraint is documented):
 *    see: https://platform.openai.com/docs/guides/structured-outputs?api-mode=responses#all-fields-must-be-required
 */

import { JsonSchemaDraft7, TransformResult } from "./schema-adapter-types.js";

type JsonSchema = JsonSchemaDraft7;

interface TransformationTracker {
  nullableFieldsAdded: string[];
  anyOfNullsAdded: string[];
  oneOfNullsAdded: string[];
  nestedSchemasProcessed: number;
}

export function makeJsonSchemaOpenAICompatible(schema: JsonSchema): TransformResult {
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

function transformSchemaInternal(schema: JsonSchema, tracker: TransformationTracker, path: string = ''): JsonSchema {
  if (typeof schema !== "object" || schema === null) {
    return schema;
  }

  const result = { ...schema };

  // Handle object properties
  if (result.properties) {
    const processedProperties: Record<string, JsonSchema> = {};
    const required = new Set(Array.isArray(result.required) ? result.required : []);

    for (const [key, propSchema] of Object.entries(result.properties)) {
      const propPath = path ? `${path}.${key}` : key;
      const processedProp = transformSchemaInternal(propSchema, tracker, propPath);
      
      // If the field is not required, make it nullable
      if (!required.has(key)) {
        if (processedProp.type && !processedProp.nullable) {
          processedProp.nullable = true;
          tracker.nullableFieldsAdded.push(propPath);
        } else if (Array.isArray(processedProp.anyOf) && !processedProp.anyOf.some((s: JsonSchema) => s.type === "null")) {
          processedProp.anyOf = [...processedProp.anyOf, { type: "null" }];
          tracker.anyOfNullsAdded.push(propPath);
        } else if (Array.isArray(processedProp.oneOf) && !processedProp.oneOf.some((s: JsonSchema) => s.type === "null")) {
          processedProp.oneOf = [...processedProp.oneOf, { type: "null" }];
          tracker.oneOfNullsAdded.push(propPath);
        }
      }
      
      processedProperties[key] = processedProp;
    }
    
    result.properties = processedProperties;
  }

  // Handle anyOf/oneOf/allOf recursively
  if (Array.isArray(result.anyOf)) {
    if (result.anyOf) {
      result.anyOf = result.anyOf.map((subSchema: JsonSchema, index: number) => {
        tracker.nestedSchemasProcessed++;
        return transformSchemaInternal(subSchema, tracker, `${path}.anyOf[${index}]`);
      });
    }
  }
  
  if (Array.isArray(result.oneOf)) {
    if (result.oneOf) {
      result.oneOf = result.oneOf.map((subSchema: JsonSchema, index: number) => {
        tracker.nestedSchemasProcessed++;
        return transformSchemaInternal(subSchema, tracker, `${path}.oneOf[${index}]`);
      });
    }
  }
  
  if (Array.isArray(result.allOf)) {
    if (result.allOf) {
      result.allOf = result.allOf.map((subSchema: JsonSchema, index: number) => {
        tracker.nestedSchemasProcessed++;
        return transformSchemaInternal(subSchema, tracker, `${path}.allOf[${index}]`);
      });
    }
  }

  // Handle array items
  if (result.items) {
    if (Array.isArray(result.items)) {
      // Items is an array of schemas (tuple validation)
      result.items = result.items.map((item: JsonSchema, index: number) => {
        tracker.nestedSchemasProcessed++;
        return transformSchemaInternal(item, tracker, `${path}.items[${index}]`);
      });
    } else {
      // Items is a single schema (applies to all items)
      tracker.nestedSchemasProcessed++;
      result.items = transformSchemaInternal(result.items, tracker, `${path}.items`);
    }
  }

  // Handle additionalProperties
  if (result.additionalProperties && 
    typeof result.additionalProperties === "object" && 
    result.additionalProperties !== null) {
    tracker.nestedSchemasProcessed++;
    result.additionalProperties = transformSchemaInternal(
      result.additionalProperties as JsonSchema, 
      tracker, 
      `${path}.additionalProperties`
    );
  }

  // Handle patternProperties (important for complex schemas)
  if (result.patternProperties) {
    const processedPatternProps: Record<string, JsonSchema> = {};
    
    for (const [pattern, patternSchema] of Object.entries(result.patternProperties)) {
      tracker.nestedSchemasProcessed++;
      processedPatternProps[pattern] = transformSchemaInternal(
        patternSchema as JsonSchema, 
        tracker, 
        `${path}.patternProperties["${pattern}"]`
      );
    }
    
    result.patternProperties = processedPatternProps;
  }

  // Handle definitions (common in complex schemas)
  if (result.definitions || result.$defs) {
    const defsKey = result.definitions ? 'definitions' : '$defs';
    const defsValue = result[defsKey];
    
    // Type guard: ensure it's an object we can iterate over
    if (defsValue && typeof defsValue === "object" && defsValue !== null && !Array.isArray(defsValue)) {
      const processedDefs: Record<string, JsonSchema> = {};
      
      for (const [key, defSchema] of Object.entries(defsValue)) {
        tracker.nestedSchemasProcessed++;
        processedDefs[key] = transformSchemaInternal(defSchema as JsonSchema, tracker, `${path}.${defsKey}.${key}`);
      }
      
      result[defsKey] = processedDefs;
    }
  }

  // Handle 'not' schemas
  if (result.not) {
    tracker.nestedSchemasProcessed++;
    result.not = transformSchemaInternal(result.not, tracker, `${path}.not`);
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
