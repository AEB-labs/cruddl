import {buildASTSchema, DocumentNode, GraphQLSchema, parse, print, Source} from "graphql";
import {
    executePostMergeTransformationPipeline,
    executePreMergeTransformationPipeline
} from "./preparation/transformation-pipeline";
import {validatePostMerge} from "./preparation/ast-validator";
import {implementScalarTypes} from './scalars/implement-scalar-types';
import {SchemaConfig} from "../config/schema-config";
import {cloneDeep} from "lodash";

/**
 Create an executable schema for a given schema definition.
 A schema definition is an array of definition parts, represented
 as a (sourced) SDL string or AST document.
  */
export function createSchema(inputSchemaConfig: SchemaConfig): GraphQLSchema {
    const schemaConfig = parseSchemaParts(inputSchemaConfig);

    const { schemaParts, ...rootContext } = schemaConfig;

    executePreMergeTransformationPipeline(schemaParts, rootContext);
    const mergedSchema: DocumentNode = mergeSchemaDefinition(schemaConfig);

    const validationResult = validatePostMerge(mergedSchema);
    if(validationResult.hasErrors()) {
        throw new Error('Invalid model:\n' + validationResult.messages.map(msg => msg.toString()).join('\n'))
    } else {
        console.log('Thank you for your valid model. I will now do some magic with it.')
    }

    executePostMergeTransformationPipeline(mergedSchema, {...rootContext});
    console.log(print(mergedSchema));
    const executableGraphQLSchema = buildASTSchema(mergedSchema);
    return implementScalarTypes(executableGraphQLSchema);
}

function mergeSchemaDefinition(schemaConfig: SchemaConfig): DocumentNode {
    return schemaConfig.schemaParts.map(modelDef => (modelDef.source instanceof Source) ? parse(modelDef.source) : modelDef.source).reduce(mergeAST);
}

/**
 * Merge two AST documents. Usable with reduce.
 * @param {DocumentNode} doc1
 * @param {DocumentNode} doc2
 * @returns {DocumentNode}
 */
function mergeAST(doc1: DocumentNode, doc2: DocumentNode): DocumentNode {
    return {
        kind: "Document",
        definitions: [...doc1.definitions, ...doc2.definitions]
    }
}

/**
 * Parse all schema parts sources which aren't AST already and deep clone all AST sources.
 * @param {SchemaConfig} schemaConfig
 * @returns {SchemaConfig}
 */
function parseSchemaParts(schemaConfig: SchemaConfig): SchemaConfig {
    return {
        ...schemaConfig,
        schemaParts: schemaConfig.schemaParts.map(schemaPart => ({
            ...schemaPart,
            source: (schemaPart.source instanceof Source) ? parse(schemaPart.source) : cloneDeep(schemaPart.source)
        }))
    };
}
