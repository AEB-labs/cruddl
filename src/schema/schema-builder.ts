import type { DocumentNode, GraphQLSchema } from 'graphql';
import { Kind as GraphQLKind } from 'graphql';
import { globalContext } from '../config/global.js';
import type { DatabaseAdapter } from '../database/database-adapter.js';
import type { Model, ValidationResult } from '../model/index.js';
import { createModel, ValidationContext } from '../model/index.js';
import { Project } from '../project/project.js';
import { SchemaGenerator } from '../schema-generation/index.js';
import { isDefined } from '../utils/utils.js';
import { parseProject } from './parsing/parse-project.js';
import { type ParsedProject, ParsedProjectSourceBaseKind } from './parsing/parsed-project.js';
import {
    validateParsedProjectSource,
    validatePostMerge,
    validateSource,
} from './preparation/ast-validator.js';
import type { SchemaTransformationContext } from './preparation/transformation-pipeline.js';
import { executePreMergeTransformationPipeline } from './preparation/transformation-pipeline.js';

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

export function validateAndPrepareSchema(project: Project): {
    validationResult: ValidationResult;
    model: Model;
} {
    const validationContext: ValidationContext = new ValidationContext();

    const sources = project.sources.flatMap((source) => {
        const sourceResult = validateSource(source);
        validationContext.addMessage(...sourceResult.messages);
        if (sourceResult.hasErrors()) {
            return [];
        }
        return [source];
    });

    const { sources: parsedSources } = parseProject(
        new Project({ ...project.options, sources }),
        validationContext,
    );

    const validParsedSources = parsedSources.flatMap((parsedSource) => {
        const sourceResult = validateParsedProjectSource(parsedSource);
        validationContext.addMessage(...sourceResult.messages);
        if (sourceResult.hasErrors()) {
            return [];
        }
        return [parsedSource];
    });

    const preparedProject = executePreMergeTransformationPipeline({ sources: validParsedSources });

    const model = createModel(preparedProject, project.options.modelOptions);

    const mergedSchema: DocumentNode = mergeSchemaDefinition(preparedProject);

    const result = validatePostMerge(mergedSchema, model);
    validationContext.addMessage(...result.messages);
    validationContext.addMessage(...model.validate().messages);

    return { validationResult: validationContext.asResult(), model };
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
        const { validationResult, model } = validateAndPrepareSchema(project);
        if (validationResult.hasErrors()) {
            throw new Error(
                'Project has errors:\n' +
                    validationResult
                        .getErrors()
                        .map((e) => e.toString())
                        .join('\n'),
            );
        }

        const schemaContext: SchemaTransformationContext = {
            ...project.options,
            databaseAdapter,
        };

        const generator = new SchemaGenerator(schemaContext);
        return generator.generate(model);
    } finally {
        globalContext.unregisterContext();
    }
}

export function getModel(project: Project): Model {
    globalContext.registerContext({ loggerProvider: project.loggerProvider });
    try {
        const { model } = validateAndPrepareSchema(project);
        return model;
    } finally {
        globalContext.unregisterContext();
    }
}

function mergeSchemaDefinition(parsedProject: ParsedProject): DocumentNode {
    const emptyDocument: DocumentNode = { kind: GraphQLKind.DOCUMENT, definitions: [] };
    const graphqlDocuments = parsedProject.sources.map((s) => {
        if (s.kind === ParsedProjectSourceBaseKind.GRAPHQL) {
            return s.document;
        } else {
            return undefined;
        }
    });
    return graphqlDocuments.filter(isDefined).reduce(mergeAST, emptyDocument);
}

/**
 * Merge two AST documents. Usable with reduce.
 * @param {DocumentNode} doc1
 * @param {DocumentNode} doc2
 * @returns {DocumentNode}
 */
function mergeAST(doc1: DocumentNode, doc2: DocumentNode): DocumentNode {
    return {
        kind: GraphQLKind.DOCUMENT,
        definitions: [...doc1.definitions, ...doc2.definitions],
    };
}
