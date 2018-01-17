import { buildASTSchema, DocumentNode, graphql, GraphQLSchema, parse, print, Source } from 'graphql';
import {
    ASTTransformationContext,
    executePostMergeTransformationPipeline,
    executePreMergeTransformationPipeline, executeSchemaTransformationPipeline
} from './preparation/transformation-pipeline';
import { validatePostMerge, ValidationResult } from './preparation/ast-validator';
import {SchemaConfig} from "../config/schema-config";
import {cloneDeep} from "lodash";
import {SchemaContext, globalContext} from "../config/global";
import { createPermissionMap } from '../authorization/permission-profile';

/**
 * Validates a schema config and thus determines whether createSchema() would succeed
 */
export function validateSchema(inputSchemaConfig: SchemaConfig): ValidationResult {
    const schemaConfig = parseSchemaParts(inputSchemaConfig);

    const rootContext: ASTTransformationContext = {
        defaultNamespace: schemaConfig.defaultNamespace,
        permissionProfiles: createPermissionMap(schemaConfig.permissionProfiles)
    };

    executePreMergeTransformationPipeline(schemaConfig.schemaParts, rootContext);
    const mergedSchema: DocumentNode = mergeSchemaDefinition(schemaConfig);

    return validatePostMerge(mergedSchema);
}

/**
 Create an executable schema for a given schema definition.
 A schema definition is an array of definition parts, represented
 as a (sourced) SDL string or AST document.
 Use the optional context to inject your logging framework.
  */
export function createSchema(inputSchemaConfig: SchemaConfig, context?: SchemaContext): GraphQLSchema {
    globalContext.registerContext(context);
    try {
        const logger = globalContext.loggerProvider.getLogger('schema-builder');

        const schemaConfig = parseSchemaParts(inputSchemaConfig);

        const rootContext: ASTTransformationContext = {
            defaultNamespace: schemaConfig.defaultNamespace,
            permissionProfiles: createPermissionMap(schemaConfig.permissionProfiles)
        };

        executePreMergeTransformationPipeline(schemaConfig.schemaParts, rootContext);
        const mergedSchema: DocumentNode = mergeSchemaDefinition(schemaConfig);

        const validationResult = validatePostMerge(mergedSchema);
        if (validationResult.hasErrors()) {
            throw new Error('Invalid model:\n' + validationResult.messages.map(msg => msg.toString()).join('\n'))
        } else {
            logger.info('Schema successfully created.')
        }

        executePostMergeTransformationPipeline(mergedSchema, rootContext);
        logger.debug(print(mergedSchema));
        const graphQLSchema = buildASTSchema(mergedSchema);
        return executeSchemaTransformationPipeline(graphQLSchema, rootContext);
    } finally {
        globalContext.unregisterContext();
    }
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
