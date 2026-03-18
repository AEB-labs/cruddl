import {
    Kind,
    load,
    type YAMLAnchorReference,
    type YamlMap,
    type YAMLMapping,
    type YAMLNode,
    type YAMLScalar,
    type YAMLSequence,
} from 'yaml-ast-parser';
import type { ProjectOptions } from '../../config/interfaces.js';
import { MessageLocation, SourcePosition } from '../../model/validation/location.js';
import { Severity, ValidationMessage } from '../../model/validation/message.js';
import { ValidationContext } from '../../model/validation/validation-context.js';
import { ProjectSource } from '../../project/source.js';
import { isReadonlyArray, type PlainObject } from '../../utils/utils.js';
import { getLineEndPosition } from '../schema-utils.js';
import { getNamespaceFromSourceName } from './namespace-from-source-name.js';
import { type ParsedObjectProjectSource, ParsedProjectSourceBaseKind } from './parsed-project.js';

export function parseYAMLSource(
    projectSource: ProjectSource,
    options: ProjectOptions,
    validationContext: ValidationContext,
): ParsedObjectProjectSource | undefined {
    const root: YAMLNode | undefined = load(projectSource.body);

    if (!root) {
        return undefined;
    }

    root.errors.forEach((error) => {
        const severity = error.isWarning ? Severity.WARNING : Severity.ERROR;

        // Errors reported do not have an end, only a start. We just choose the line end as the end.
        // While there is a toLineEnd boolean, we ignore this, because what else would we really do?
        let location: MessageLocation;
        if (error.mark.position < projectSource.body.length) {
            location = new MessageLocation(
                projectSource,
                new SourcePosition(error.mark.position, error.mark.line + 1, error.mark.column + 1),
                getLineEndPosition(error.mark.line + 1, projectSource),
            );
        } else {
            // This is an exception: An error can be reported at the EOL. Calculating the EOL would not work
            // -> just report the error at the last character
            location = new MessageLocation(
                projectSource,
                projectSource.body.length - 1,
                projectSource.body.length,
            );
        }

        validationContext.addMessage(
            new ValidationMessage({ severity, message: error.reason, location }),
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
            const path: ReadonlyArray<string | number> = [...curPath, mappingNode.key.value];
            if (mappingNode.value) {
                return [{ path, node: mappingNode }, ...extractAllPaths(mappingNode.value, path)];
            } else {
                return [{ path, node: mappingNode }];
            }
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

function extractJSONFromYAML(
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

    if (isReadonlyArray(result)) {
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
