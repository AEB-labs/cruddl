import { DocumentNode, getLocation, GraphQLError, GraphQLSchema, parse } from 'graphql';
import { parse as JSONparse } from 'json-source-map';
import { compact } from 'lodash';
import {
    Kind,
    load,
    YAMLAnchorReference,
    YamlMap,
    YAMLMapping,
    YAMLNode,
    YAMLScalar,
    YAMLSequence,
} from 'yaml-ast-parser';
import { globalContext } from '../config/global';
import {
    ParsedGraphQLProjectSource,
    ParsedObjectProjectSource,
    ParsedProject,
    ParsedProjectSource,
    ParsedProjectSourceBaseKind,
} from '../config/parsed-project';
import { DatabaseAdapter } from '../database/database-adapter';
import {
    createModel,
    Model,
    Severity,
    SourcePosition,
    ValidationContext,
    ValidationMessage,
    ValidationResult,
} from '../model';
import { MessageLocation } from '../model/';
import { Project, ProjectOptions } from '../project/project';
import { ProjectSource, SourceType } from '../project/source';
import { SchemaGenerator } from '../schema-generation';
import { flatMap, PlainObject } from '../utils/utils';
import {
    validateParsedProjectSource,
    validatePostMerge,
    validateSource,
} from './preparation/ast-validator';
import {
    executePreMergeTransformationPipeline,
    executeSchemaTransformationPipeline,
    SchemaTransformationContext,
} from './preparation/transformation-pipeline';
import { getLineEndPosition } from './schema-utils';
import jsonLint = require('json-lint');
import stripJsonComments = require('strip-json-comments');

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

    const sources = flatMap(project.sources, (source) => {
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

    const validParsedSources = flatMap(parsedSources, (parsedSource) => {
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
            throw new Error('Project has errors:\n' + validationResult.toString());
        }

        const schemaContext: SchemaTransformationContext = {
            ...project.options,
            databaseAdapter,
        };

        const generator = new SchemaGenerator(schemaContext);
        const graphQLSchema = generator.generate(model);
        return executeSchemaTransformationPipeline(graphQLSchema, schemaContext, model);
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
    const graphqlDocuments = parsedProject.sources.map((s) => {
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
        definitions: [...doc1.definitions, ...doc2.definitions],
    };
}

/**
 * Parse all schema parts sources which aren't AST already and deep clone all AST sources.
 */
export function parseProject(
    project: Project,
    validationContext: ValidationContext,
): ParsedProject {
    return {
        sources: compact(
            project.sources.map((source) =>
                parseProjectSource(source, project.options, validationContext),
            ),
        ),
    };
}

function parseYAMLSource(
    projectSource: ProjectSource,
    options: ProjectOptions,
    validationContext: ValidationContext,
): ParsedObjectProjectSource | undefined {
    const root: YAMLNode | undefined = load(projectSource.body);

    if (!root) {
        return undefined;
    }

    root.errors.forEach((error) => {
        const severity = error.isWarning ? Severity.Warning : Severity.Error;
        const endPos = getLineEndPosition(error.mark.line + 1, projectSource);
        validationContext.addMessage(
            new ValidationMessage(
                severity,
                error.reason,
                new MessageLocation(
                    projectSource,
                    new SourcePosition(
                        error.mark.position,
                        error.mark.line + 1,
                        error.mark.column + 1,
                    ),
                    endPos,
                ),
            ),
        );
    });

    if (root.errors.some((error) => !error.isWarning)) {
        // returning undefined will lead to ignoring this source file in future steps
        return undefined;
    }

    const yamlData = extractJSONFromYAML(root, validationContext, projectSource);

    if (yamlData === undefined) {
        return undefined;
    }

    const pathLocationMap = extractMessageLocationsFromYAML(root, projectSource);

    return {
        kind: ParsedProjectSourceBaseKind.OBJECT,
        namespacePath:
            options.modelOptions?.useSourceDirectoriesAsNamespaces === false
                ? []
                : getNamespaceFromSourceName(projectSource.name),
        object: (yamlData as PlainObject) || {},
        pathLocationMap: pathLocationMap,
    };
}

function parseJSONSource(
    projectSource: ProjectSource,
    options: ProjectOptions,
    validationContext: ValidationContext,
): ParsedObjectProjectSource | undefined {
    if (projectSource.body.trim() === '') {
        return undefined;
    }

    // perform general JSON syntax check
    const lintResult = jsonLint(projectSource.body, { comments: true });
    if (lintResult.error) {
        let loc: MessageLocation | undefined;
        if (
            typeof lintResult.line == 'number' &&
            typeof lintResult.i == 'number' &&
            typeof lintResult.character == 'number'
        ) {
            loc = new MessageLocation(projectSource, lintResult.i, projectSource.body.length);
        }
        validationContext.addMessage(ValidationMessage.error(lintResult.error, loc));
        // returning undefined will lead to ignoring this source file in future steps
        return undefined;
    }

    // parse JSON
    const jsonPathLocationMap: { [path: string]: MessageLocation } = {};

    // whitespace: true replaces non-whitespace in comments with spaces so that the sourcemap still matches
    const bodyWithoutComments = stripJsonComments(projectSource.body, { whitespace: true });
    const parseResult = JSONparse(bodyWithoutComments);
    const pointers = parseResult.pointers;

    for (const key in pointers) {
        const pointer = pointers[key];
        jsonPathLocationMap[key] = new MessageLocation(
            projectSource,
            pointer.value.pos,
            pointer.valueEnd.pos,
        );
    }

    const data: PlainObject = parseResult.data;

    // arrays are not forbidden by json-lint
    if (Array.isArray(data)) {
        validationContext.addMessage(
            ValidationMessage.error(
                `JSON file should define an object (is array)`,
                new MessageLocation(projectSource, 0, projectSource.body.length),
            ),
        );
        return undefined;
    }

    return {
        kind: ParsedProjectSourceBaseKind.OBJECT,
        namespacePath:
            options.modelOptions?.useSourceDirectoriesAsNamespaces === false
                ? []
                : getNamespaceFromSourceName(projectSource.name),
        object: (data as PlainObject) || {},
        pathLocationMap: jsonPathLocationMap,
    };
}

function parseGraphQLsSource(
    projectSource: ProjectSource,
    options: ProjectOptions,
    validationContext: ValidationContext,
): ParsedGraphQLProjectSource | undefined {
    if (projectSource.body.trim() === '') {
        return undefined;
    }

    let document: DocumentNode;
    try {
        document = parse(projectSource.toGraphQLSource());
    } catch (e) {
        if (e instanceof GraphQLError) {
            const message = getMessageFromGraphQLSyntaxError(e);
            const location = getGraphQLMessageLocation(e);
            validationContext.addMessage(ValidationMessage.error(message, location));
            return undefined;
        }
        throw e;
    }

    return {
        kind: ParsedProjectSourceBaseKind.GRAPHQL,
        namespacePath:
            options.modelOptions?.useSourceDirectoriesAsNamespaces === false
                ? []
                : getNamespaceFromSourceName(projectSource.name),
        document: document,
    };
}

export function parseProjectSource(
    projectSource: ProjectSource,
    options: ProjectOptions,
    validationContext: ValidationContext,
): ParsedProjectSource | undefined {
    switch (projectSource.type) {
        case SourceType.YAML:
            return parseYAMLSource(projectSource, options, validationContext);
        case SourceType.JSON:
            return parseJSONSource(projectSource, options, validationContext);
        case SourceType.GRAPHQLS:
            return parseGraphQLsSource(projectSource, options, validationContext);
        default:
            throw new Error(`Unexpected project source type: ${projectSource.type}`);
    }
}

function getNamespaceFromSourceName(name: string): ReadonlyArray<string> {
    if (name.includes('/')) {
        return name.substr(0, name.lastIndexOf('/')).replace(/\//g, '.').split('.');
    }
    return []; // default namespace
}

/**
 * extracts out of a given YAML a set of paths (fields concatenated with '/') and returns corresponding MessageLocations
 * @param {ProjectSource} source containing valid YAML (returns error if source is not valid)
 * @returns {{[p: string]: MessageLocation}} a map of paths to message locations
 */
function extractMessageLocationsFromYAML(
    root: YAMLNode,
    source: ProjectSource,
): { [path: string]: MessageLocation } {
    const result = extractAllPaths(root, [] as ReadonlyArray<string | number>);
    let messageLocations: { [path: string]: MessageLocation } = {};
    result.forEach(
        (val) =>
            (messageLocations['/' + val.path.join('/')] = new MessageLocation(
                source,
                val.node.startPosition,
                val.node.endPosition,
            )),
    );

    return messageLocations;
}

/**
 * recursive function which traverses the abstract syntax tree of the YAML source
 * @param {YAMLNode} node root node
 * @param {ReadonlyArray<string | number>} curPath
 * @returns {{path: ReadonlyArray<string | number>; node: YAMLNode}[]}
 */
function extractAllPaths(
    node: YAMLNode,
    curPath: ReadonlyArray<string | number>,
): { path: ReadonlyArray<string | number>; node: YAMLNode }[] {
    switch (node.kind) {
        case Kind.MAP:
            const mapNode = node as YamlMap;
            const mergedMap = (
                [] as { path: ReadonlyArray<string | number>; node: YAMLNode }[]
            ).concat(
                ...mapNode.mappings.map((childNode) => extractAllPaths(childNode, [...curPath])),
            );
            return [...mergedMap];
        case Kind.MAPPING:
            const mappingNode = node as YAMLMapping;
            if (mappingNode.value) {
                return [
                    { path: [...curPath, mappingNode.key.value], node: mappingNode },
                    ...extractAllPaths(mappingNode.value, [...curPath, mappingNode.key.value]),
                ];
            }
            break;
        case Kind.SCALAR:
            const scalarNode = node as YAMLScalar;
            if (scalarNode.parent && scalarNode.parent.kind == Kind.SEQ) {
                return [{ path: curPath, node: scalarNode }];
            } else {
                return [{ path: curPath, node: scalarNode.parent }];
            }
        case Kind.SEQ:
            const seqNode = node as YAMLSequence;
            const mergedSequence = (
                [] as { path: ReadonlyArray<string | number>; node: YAMLNode }[]
            ).concat(
                ...seqNode.items.map((childNode, index) =>
                    extractAllPaths(childNode, [...curPath, index]),
                ),
            );
            return [...mergedSequence];
        case Kind.INCLUDE_REF:
        case Kind.ANCHOR_REF:
            const refNode = node as YAMLAnchorReference;
            return extractAllPaths(refNode.value, [...curPath]);
    }
    return [{ path: curPath, node: node }];
}

export function extractJSONFromYAML(
    root: YAMLNode,
    validationContext: ValidationContext,
    source: ProjectSource,
): PlainObject | undefined {
    const result = recursiveObjectExtraction(root, {}, validationContext, source);
    if (typeof result !== 'object') {
        validationContext.addMessage(
            ValidationMessage.error(
                `YAML file should define an object (is ${typeof result})`,
                new MessageLocation(source, 0, source.body.length),
            ),
        );
        return undefined;
    }

    if (Array.isArray(result)) {
        validationContext.addMessage(
            ValidationMessage.error(
                `YAML file should define an object (is array)`,
                new MessageLocation(source, 0, source.body.length),
            ),
        );
        return undefined;
    }

    return result as PlainObject;
}

function recursiveObjectExtraction(
    node: YAMLNode | undefined,
    object: PlainObject,
    validationContext: ValidationContext,
    source: ProjectSource,
): any {
    // ATTENTION: Typings of the yaml ast parser are wrong
    if (!node) {
        return object;
    }
    switch (node.kind) {
        case Kind.MAP:
            const mapNode = node as YamlMap;
            mapNode.mappings.forEach((val) => {
                object[val.key.value] = recursiveObjectExtraction(
                    val.value,
                    {},
                    validationContext,
                    source,
                );
            });
            return object;
        case Kind.MAPPING:
            throw new Error('Should never be reached since a mapping can not exist without a map.');
        case Kind.SCALAR:
            const scalarNode = node as YAMLScalar;
            // check whether string or number scalar
            if (
                scalarNode.doubleQuoted ||
                scalarNode.singleQuoted ||
                isNaN(Number(scalarNode.value))
            ) {
                return scalarNode.value;
            } else {
                return Number(scalarNode.value);
            }
        case Kind.SEQ:
            const seqNode = node as YAMLSequence;
            return seqNode.items.map((val) =>
                recursiveObjectExtraction(val, {}, validationContext, source),
            );
        case Kind.INCLUDE_REF:
            validationContext.addMessage(
                ValidationMessage.error(
                    `Include references are not supported`,
                    new MessageLocation(source, node.startPosition, node.endPosition),
                ),
            );
            return undefined;
        case Kind.ANCHOR_REF:
            validationContext.addMessage(
                ValidationMessage.error(
                    `Anchor references are not supported`,
                    new MessageLocation(source, node.startPosition, node.endPosition),
                ),
            );
            return undefined;
    }
    throw new Error('An error occured while parsing the YAML file');
}

function getMessageFromGraphQLSyntaxError(error: GraphQLError): string {
    const captures = error.message.match(/^Syntax Error .* \(\d+:\d+\) (.*)/);
    if (captures) {
        return captures[1];
    }
    return error.message;
}

function getGraphQLMessageLocation(error: GraphQLError): MessageLocation | undefined {
    if (
        !error.source ||
        !error.locations ||
        !error.locations.length ||
        !error.positions ||
        !error.positions.length
    ) {
        return undefined;
    }
    const endOffset = error.source.body.length;
    const endLoc = getLocation(error.source, endOffset);
    return new MessageLocation(
        ProjectSource.fromGraphQLSource(error.source) || error.source.name,
        new SourcePosition(error.positions[0], error.locations[0].line, error.locations[0].column),
        new SourcePosition(endOffset, endLoc.line, endLoc.column),
    );
}
