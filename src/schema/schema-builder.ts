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
import { parse as JSONparse, Pointer, Pointers } from 'json-source-map';
import stripJsonComments = require('strip-json-comments');
import { Kind, load, YAMLAnchorReference, YamlMap, YAMLMapping, YAMLNode, YAMLScalar, YAMLSequence } from 'yaml-ast-parser';
import { MessageLocation } from '../model/validation/message';

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


function validateAndPrepareSchema(project: Project): { validationResult: ValidationResult, model: Model } {
    const messages: ValidationMessage[] = [];

    const sources = flatMap(project.sources, source => {
        const sourceResult = validateSource(source);
        messages.push(...sourceResult.messages);
        if (sourceResult.hasErrors()) {
            return [];
        }
        return [source];
    });

    const parsedProject = parseProject(new Project({ ...project, sources }));

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
    globalContext.registerContext({ loggerProvider: project.loggerProvider });
    try {
        const { model } = validateAndPrepareSchema(project);
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

function parseProjectSource(projectSource: ProjectSource): ParsedProjectSource | undefined {
    switch (projectSource.type) {
        case SourceType.YAML:
            const yamlData = loadYaml(projectSource.body);

            const pathLocationMap = extractMessageLocationsFromYAML(projectSource);

            return {
                kind: ParsedProjectSourceBaseKind.OBJECT,
                namespacePath: getNamespaceFromSourceName(projectSource.name),
                object: yamlData as PlainObject || {},
                pathLocationMap: pathLocationMap
            };
            break;
        case SourceType.JSON:
            let data = {} as PlainObject;

            const jsonPathLocationMap: {[path: string]: MessageLocation} = {};

            try {
                // whitespace: true replaces non-whitespace in comments with spaces so that the sourcemap still matches
                const bodyWithoutComments = stripJsonComments(projectSource.body, { whitespace: true });
                const result = JSONparse(bodyWithoutComments);
                const pointers = result.pointers;

                for(const key in pointers) {
                    const pointer = pointers[key];
                    jsonPathLocationMap[key] = new MessageLocation(projectSource, pointer.key.pos, pointer.valueEnd.pos);
                }

                data = result.data;
            } catch (e) {
                throw new Error("No valid JSON supplied in "+projectSource.name);
            }

            return {
                kind: ParsedProjectSourceBaseKind.OBJECT,
                namespacePath: getNamespaceFromSourceName(projectSource.name),
                object: data as PlainObject || {},
                pathLocationMap: jsonPathLocationMap
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

function extractMessageLocationsFromYAML(source: ProjectSource): { [path: string]: MessageLocation } {
    const root: YAMLNode | undefined = load(source.body);
    if (!root) {
        throw new Error("No valid yaml suplied in "+source.name);
    }
    const result = extractAllPaths(root, [] as ReadonlyArray<(string | number)>);
    let messageLocations: { [path: string]: MessageLocation } = {};
    result.forEach(val => messageLocations[val.path.join('/')] = new MessageLocation(source, val.node.startPosition, val.node.endPosition));

    return messageLocations;
}

function extractAllPaths(node: YAMLNode, curPath: ReadonlyArray<(string | number)>): { path: ReadonlyArray<(string | number)>, node: YAMLNode }[] {
    switch (node.kind) {
        case Kind.MAP:
            const mapNode = node as YamlMap;
            const mergedMap = ([] as { path: ReadonlyArray<(string | number)>, node: YAMLNode }[]).concat(...(mapNode.mappings.map(
                (childNode) => extractAllPaths(childNode, [...curPath]))));
            return [...mergedMap];
        case Kind.MAPPING:
            const mappingNode = node as YAMLMapping;
            console.log(mappingNode.key.value);
            if (mappingNode.value) {
                return [
                    { path: curPath, node: mappingNode },
                    ...extractAllPaths(mappingNode.value, [...curPath, mappingNode.key.value])
                ];
            }
            break;
        case Kind.SCALAR:
            const scalarNode = node as YAMLScalar;
            console.log(curPath);
            return [{ path: curPath, node: scalarNode.parent }];
        case Kind.SEQ:
            const seqNode = node as YAMLSequence;
            const mergedSequence = ([] as { path: ReadonlyArray<(string | number)>, node: YAMLNode }[]).concat(...(seqNode.items.map(
                (childNode, index) => extractAllPaths(childNode, [...curPath, index]))));
            return [...mergedSequence];
        case Kind.INCLUDE_REF:
        case Kind.ANCHOR_REF:
            const refNode = node as YAMLAnchorReference;
            return extractAllPaths(refNode.value, [...curPath]);
    }
    return [{ path: curPath, node: node }];
}