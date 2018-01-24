import { buildASTSchema, DocumentNode, GraphQLSchema, parse, print, Source } from 'graphql';
import {
    ASTTransformationContext, executePostMergeTransformationPipeline, executePreMergeTransformationPipeline,
    executeSchemaTransformationPipeline, SchemaTransformationContext
} from './preparation/transformation-pipeline';
import { validatePostMerge, ValidationResult } from './preparation/ast-validator';
import { SchemaConfig, SchemaPartConfig } from '../config/schema-config';
import { globalContext } from '../config/global';
import { createPermissionMap } from '../authorization/permission-profile';
import { Project } from '../project/project';
import { DatabaseAdapter } from '../database/database-adapter';
import { SourceType } from '../project/source';
import { load as loadYaml } from 'js-yaml';

/**
 * Validates a project and thus determines whether createSchema() would succeed
 */
export function validateSchema(project: Project): ValidationResult {
    const schemaConfig = parseSchemaParts(project);

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
export function createSchema(project: Project, databaseAdapter: DatabaseAdapter): GraphQLSchema {
    globalContext.registerContext({ loggerProvider: project.loggerProvider });
    try {
        const logger = globalContext.loggerProvider.getLogger('schema-builder');

        const schemaConfig = parseSchemaParts(project);

        const rootContext: SchemaTransformationContext = {
            defaultNamespace: schemaConfig.defaultNamespace,
            permissionProfiles: createPermissionMap(schemaConfig.permissionProfiles),
            loggerProvider: project.loggerProvider,
            databaseAdapter
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
 */
function parseSchemaParts(project: Project): SchemaConfig {
    // TODO handle parse errors and validate yaml against json-schema, also merge yaml in a better way

    const yamlObjects = project.getSourcesOfType(SourceType.YAML).map(source => loadYaml(source.body));
    const mergedYaml = Object.assign({}, ...yamlObjects);
    return {
        defaultNamespace: project.defaultNamespace,
        schemaParts: project.getSourcesOfType(SourceType.GRAPHQLS).map((source): SchemaPartConfig => ({
            source: parse(new Source(source.body, source.name)),
            localNamespace: getNamespaceFromSourceName(source.name)
        })),
        permissionProfiles: mergedYaml.permissionProfiles
    };
}

function getNamespaceFromSourceName(name: string): string|undefined {
    if (name.includes('/')) {
        return name.substr(0, name.lastIndexOf('/')).replace(/\//g, '.');
    }
    return undefined; // default namespace
}
