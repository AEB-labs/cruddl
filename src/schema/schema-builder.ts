import { buildASTSchema, DocumentNode, GraphQLSchema, parse, print } from 'graphql';
import {
    ASTTransformationContext, executePostMergeTransformationPipeline, executePreMergeTransformationPipeline,
    executeSchemaTransformationPipeline, SchemaTransformationContext
} from './preparation/transformation-pipeline';
import { validatePostMerge, validateSource } from './preparation/ast-validator';
import { SchemaConfig, SchemaPartConfig } from '../config/schema-config';
import { globalContext } from '../config/global';
import { createModel, Model } from '../model';
import { Project } from '../project/project';
import { DatabaseAdapter } from '../database/database-adapter';
import { SourceType } from '../project/source';
import { load as loadYaml } from 'js-yaml';
import { ValidationMessage, ValidationResult } from '../model/validation';
import { flatMap } from '../utils/utils';
import { createPermissionMap } from '../model/implementation/permission-profile';

/**
 * Validates a project and thus determines whether createSchema() would succeed
 */
export function validateSchema(project: Project): ValidationResult {
    globalContext.registerContext({ loggerProvider: project.loggerProvider });
    try {
        return validateAndPrepareSchema(project).validationResult;
    } finally {
        globalContext.unregisterContext();
    }
}


function validateAndPrepareSchema(project: Project):
        { validationResult: ValidationResult, schemaConfig: SchemaConfig, mergedSchema: DocumentNode, rootContext: ASTTransformationContext, model: Model } {
    const messages: ValidationMessage[] = [];

    const sources = flatMap(project.sources, source => {
        const sourceResult = validateSource(source);
        messages.push(...sourceResult.messages);
        if (sourceResult.hasErrors()) {
            return [];
        }
        return [ source ];
    });

    const schemaConfig = parseSchemaParts(new Project({...project, sources}));
    const rootContext: ASTTransformationContext = {
        defaultNamespace: schemaConfig.defaultNamespace,
        permissionProfiles: createPermissionMap(schemaConfig.permissionProfiles)
    };

    const model = createModel(schemaConfig);

    executePreMergeTransformationPipeline(schemaConfig.schemaParts, rootContext, model);
    const mergedSchema: DocumentNode = mergeSchemaDefinition(schemaConfig);

    const result = validatePostMerge(mergedSchema, rootContext, model);
    //messages.push(...result.messages);
    messages.push(...model.validate().messages);

    const validationResult = new ValidationResult(messages);
    return { validationResult, schemaConfig, mergedSchema, rootContext, model };
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

        const { validationResult, schemaConfig, mergedSchema, rootContext, model } = validateAndPrepareSchema(project);
        if (validationResult.hasErrors()) {
            throw new Error('Project has errors:\n' + validationResult.toString())
        }

        executePostMergeTransformationPipeline(mergedSchema, rootContext, model);
        if (logger.isTraceEnabled()) {
            logger.trace(`Transformed schema: ${print(mergedSchema)}`);
        }

        const schemaContext: SchemaTransformationContext = {
            ...rootContext,
            loggerProvider: project.loggerProvider,
            databaseAdapter
        };

        const graphQLSchema = buildASTSchema(mergedSchema);
        const finalSchema = executeSchemaTransformationPipeline(graphQLSchema, schemaContext, model);
        logger.info('Schema created successfully.');
        return finalSchema;
    } finally {
        globalContext.unregisterContext();
    }
}


export function getModel(project: Project): Model {
    globalContext.registerContext({loggerProvider: project.loggerProvider});
    try {
        const { model} = validateAndPrepareSchema(project);
        return model;
    } finally {
        globalContext.unregisterContext();
    }
}

function mergeSchemaDefinition(schemaConfig: SchemaConfig): DocumentNode {
    const emptyDocument: DocumentNode = { kind: "Document", definitions: [] };
    return schemaConfig.schemaParts.map(part => part.document).reduce(mergeAST, emptyDocument);
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
    // TODO merge individual properties of yaml somehow
    const yamlObjects = project.sources
        .filter(s => s.type == SourceType.YAML || s.type == SourceType.JSON)
        .map(source => loadYaml(source.body));
    const mergedYaml = Object.assign({}, ...yamlObjects);

    return {
        defaultNamespace: project.defaultNamespace,
        schemaParts: project.getSourcesOfType(SourceType.GRAPHQLS).map((source): SchemaPartConfig => ({
            document: parse(source.toGraphQLSource()),
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
