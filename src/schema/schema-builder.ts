import { DocumentNode, GraphQLSchema, parse } from 'graphql';
import { load as loadYaml } from 'js-yaml';
import { compact } from 'lodash';
import { globalContext } from '../config/global';
import { ParsedProject, ParsedProjectSource, ParsedProjectSourceBaseKind } from '../config/parsed-project';
import { DatabaseAdapter } from '../database/database-adapter';
import { createModel, Model, ValidationMessage, ValidationResult } from '../model';
import { Project } from '../project/project';
import { ProjectSource, SourceType } from '../project/source';
import { SchemaGenerator } from '../schema-generation';
import { flatMap, PlainObject } from '../utils/utils';
import { validatePostMerge, validateSource } from './preparation/ast-validator';
import {
    executePreMergeTransformationPipeline, executeSchemaTransformationPipeline, SchemaTransformationContext
} from './preparation/transformation-pipeline';

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
        { validationResult: ValidationResult, model: Model } {
    const messages: ValidationMessage[] = [];

    const sources = flatMap(project.sources, source => {
        const sourceResult = validateSource(source);
        messages.push(...sourceResult.messages);
        if (sourceResult.hasErrors()) {
            return [];
        }
        return [ source ];
    });

    const parsedProject = parseProject(new Project({...project, sources}));

    const preparedProject = executePreMergeTransformationPipeline(parsedProject);

    const model = createModel(preparedProject);

    const mergedSchema: DocumentNode = mergeSchemaDefinition(preparedProject);

    const result = validatePostMerge(mergedSchema, model);
    messages.push(...result.messages);
    messages.push(...model.validate().messages);

    const validationResult = new ValidationResult(messages);
    return { validationResult, model };
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

        const { validationResult, model } = validateAndPrepareSchema(project);
        if (validationResult.hasErrors()) {
            throw new Error('Project has errors:\n' + validationResult.toString());
        }

        const schemaContext: SchemaTransformationContext = {
            loggerProvider: project.loggerProvider,
            databaseAdapter
        };

        const generator = new SchemaGenerator(schemaContext);
        const graphQLSchema = generator.generate(model);
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

function mergeSchemaDefinition(parsedProject: ParsedProject): DocumentNode {
    const emptyDocument: DocumentNode = { kind: 'Document', definitions: [] };
    const graphqlDocuments = parsedProject.sources.map(s => {
        if (s.kind === ParsedProjectSourceBaseKind.GRAPHQL) {
            return s.document;
        } else {
            return undefined;
        }
    });
    return compact(graphqlDocuments).reduce(mergeAST, emptyDocument);
}

/**
 * Merge two AST documents. Usable with reduce.
 * @param {DocumentNode} doc1
 * @param {DocumentNode} doc2
 * @returns {DocumentNode}
 */
function mergeAST(doc1: DocumentNode, doc2: DocumentNode): DocumentNode {
    return {
        kind: 'Document',
        definitions: [...doc1.definitions, ...doc2.definitions]
    };
}

/**
 * Parse all schema parts sources which aren't AST already and deep clone all AST sources.
 */
function parseProject(project: Project): ParsedProject {
    return {
        sources: compact(project.sources.map(source => parseProjectSource(source)))
    };
}

function parseProjectSource(projectSource: ProjectSource): ParsedProjectSource|undefined {
    switch (projectSource.type) {
        case SourceType.JSON:
        case SourceType.YAML:
            return {
                kind: ParsedProjectSourceBaseKind.OBJECT,
                namespacePath: getNamespaceFromSourceName(projectSource.name),
                object: loadYaml(projectSource.body) as PlainObject || {}
            };
        case SourceType.GRAPHQLS:
            return {
                kind: ParsedProjectSourceBaseKind.GRAPHQL,
                namespacePath: getNamespaceFromSourceName(projectSource.name),
                document: parse(projectSource.toGraphQLSource())
            };
    }
}

function getNamespaceFromSourceName(name: string): ReadonlyArray<string> {
    if (name.includes('/')) {
        return name.substr(0, name.lastIndexOf('/')).replace(/\//g, '.').split('.');
    }
    return []; // default namespace
}
