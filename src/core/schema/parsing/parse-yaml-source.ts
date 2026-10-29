import {
    isAlias,
    isMap,
    isScalar,
    isSeq,
    parseDocument,
    Scalar,
    type YAMLError,
    type Node as YamlNode,
} from 'yaml';
import type { ProjectOptions } from '../../config/interfaces.js';
import { ChangeSet, TextChange } from '../../model/change-set/change-set.js';
import { MessageLocation } from '../../model/validation/location.js';
import { Severity, ValidationMessage } from '../../model/validation/message.js';
import { QuickFix } from '../../model/validation/quick-fix.js';
import { ValidationContext } from '../../model/validation/validation-context.js';
import { ProjectSource } from '../../project/source.js';
import type { Mutable } from '../../utils/util-types.js';
import { type PlainObject } from '../../utils/utils.js';
import { toJsonPointer } from './json-pointer.js';
import { getNamespaceFromSourceName } from './namespace-from-source-name.js';
import {
    ParsedProjectSourceBaseKind,
    type ParsedObjectProjectSource,
    type PathLocationMap,
} from './parsed-project.js';

export function parseYAMLSource(
    projectSource: ProjectSource,
    options: ProjectOptions,
    validationContext: ValidationContext,
): ParsedObjectProjectSource | undefined {
    const doc = parseDocument(projectSource.body, {
        // YAML 1.2 core schema: no !!binary or !!timestamp, which would not survive JSON validation
        schema: 'core',
        // "<<" merge keys are a YAML 1.1 feature and rely on aliases, which we do not support
        merge: false,
        // the yaml package compares resolved keys ("True" equals "true"), but we use plain keys as
        // written, so we check for duplicates ourselves
        uniqueKeys: false,
        // keep error messages short; we report the location separately
        prettyErrors: false,
    });

    const messages = [
        ...doc.errors.map((error) => convertError(error, getSeverity(error), projectSource)),
        ...doc.warnings.map((warning) =>
            convertError(warning, getSeverity(warning), projectSource),
        ),
    ];
    messages.forEach((message) => validationContext.addMessage(message));
    if (messages.some((message) => message.severity === Severity.ERROR)) {
        // returning undefined will lead to ignoring this source file in future steps
        return undefined;
    }

    // empty file or only comments
    if (!doc.contents || (isScalar(doc.contents) && doc.contents.value === null)) {
        return undefined;
    }

    if (!isMap(doc.contents)) {
        validationContext.addMessage(
            ValidationMessage.error(
                `YAML file should define an object (is ${describeNodeType(doc.contents)})`,
                new MessageLocation(projectSource, 0, projectSource.body.length),
            ),
        );
        return undefined;
    }

    const conversionMessages: ValidationMessage[] = [];
    const data = convertNode(doc.contents, projectSource, conversionMessages);
    conversionMessages.forEach((message) => validationContext.addMessage(message));
    if (conversionMessages.some((message) => message.severity === Severity.ERROR)) {
        return undefined;
    }

    return {
        kind: ParsedProjectSourceBaseKind.OBJECT,
        namespacePath:
            options.modelOptions?.useSourceDirectoriesAsNamespaces === false
                ? []
                : getNamespaceFromSourceName(projectSource.name),
        object: data as PlainObject,
        pathLocationMap: getPathLocationMap(doc.contents, projectSource),
    };
}

function getSeverity(error: YAMLError): Severity {
    switch (error.code) {
        case 'TAB_AS_INDENT':
            // yaml-ast-parser only warned about tabs and the resulting tree is the same
            return Severity.WARNING;
        case 'TAG_RESOLVE_FAILED':
            // the yaml package falls back to a string (e.g. for "!!int abc"), we don't want to guess
            return Severity.ERROR;
        default:
            return error.name === 'YAMLWarning' ? Severity.WARNING : Severity.ERROR;
    }
}

function convertError(error: YAMLError, severity: Severity, source: ProjectSource) {
    // pos can be empty (end equals start) or point at the end of the source; make sure the
    // location covers at least one character within the source
    const start = Math.min(error.pos[0], Math.max(source.body.length - 1, 0));
    const end = Math.min(Math.max(error.pos[1], start + 1), source.body.length);
    return new ValidationMessage({
        severity,
        message: getErrorMessage(error),
        location: new MessageLocation(source, start, end),
    });
}

function getErrorMessage(error: YAMLError): string {
    switch (error.code) {
        case 'MULTIPLE_DOCS':
            return 'YAML file should contain a single document';
        case 'TAB_AS_INDENT':
            return 'Using tabs can lead to unpredictable results';
        default:
            return error.message;
    }
}

function describeNodeType(node: YamlNode): string {
    if (isSeq(node)) {
        return 'array';
    }
    if (isScalar(node)) {
        return typeof node.value;
    }
    return 'alias';
}

/**
 * Converts the YAML AST into plain JSON-like data, reporting unsupported constructs
 */
function convertNode(
    node: YamlNode | null,
    source: ProjectSource,
    messages: ValidationMessage[],
): unknown {
    // kept for compatibility: "key:" or "- " without a value used to produce an empty object
    if (!node || isEmptyValue(node)) {
        return {};
    }
    if (isMap(node)) {
        // null-prototype so keys like "__proto__" or "toString" are plain data
        const object: PlainObject = Object.create(null);
        for (const pair of node.items) {
            if (!isScalar(pair.key)) {
                messages.push(
                    ValidationMessage.error(
                        `Only simple keys are supported`,
                        getNodeLocation(pair.key as YamlNode, source),
                    ),
                );
                continue;
            }
            const key = getKeyString(pair.key);
            if (key in object) {
                messages.push(
                    ValidationMessage.error(
                        `Duplicate key "${key}"`,
                        getNodeLocation(pair.key, source),
                    ),
                );
                continue;
            }
            object[key] = convertNode(pair.value as YamlNode | null, source, messages);
        }
        return object;
    }
    if (isSeq(node)) {
        return node.items.map((item) => convertNode(item as YamlNode | null, source, messages));
    }
    if (isAlias(node)) {
        messages.push(
            ValidationMessage.error(
                `Anchor references are not supported`,
                getNodeLocation(node, source),
            ),
        );
        return undefined;
    }
    if (!isScalar(node)) {
        throw new Error(`Unexpected YAML node: ${String(node)}`);
    }
    return convertScalar(node, source, messages);
}

function convertScalar(node: Scalar, source: ProjectSource, messages: ValidationMessage[]) {
    const value = node.value;
    if (
        (typeof value === 'boolean' || value === null) &&
        node.type === Scalar.PLAIN &&
        !node.tag &&
        node.source
    ) {
        // yaml-ast-parser returned unquoted true/false/null as strings. Keep that for now, but
        // warn because YAML 1.2 defines them as booleans and null.
        const location = getNodeLocation(node, source);
        messages.push(
            ValidationMessage.nonSuppressableWarning(
                `"${node.source}" is currently read as a string, but will be read as ${value === null ? 'null' : 'a boolean'} in a future version. Put it in quotes to keep it a string.`,
                location,
                {
                    quickFixes: [
                        new QuickFix({
                            description: 'Put in quotes',
                            isPreferred: true,
                            changeSet: new ChangeSet([
                                new TextChange(location, JSON.stringify(node.source)),
                            ]),
                        }),
                    ],
                },
            ),
        );
        return node.source;
    }
    if (
        value === null ||
        typeof value === 'string' ||
        typeof value === 'boolean' ||
        (typeof value === 'number' && Number.isFinite(value))
    ) {
        return value;
    }
    if (typeof value === 'number' && node.source) {
        // .inf and .nan can't be represented in JSON, so keep them as strings
        return node.source;
    }
    messages.push(
        ValidationMessage.error(
            `Unsupported YAML value${node.tag ? ` with tag ${node.tag}` : ''}`,
            getNodeLocation(node, source),
        ),
    );
    return undefined;
}

function getKeyString(key: Scalar): string {
    // Plain keys are names, so take them as written ("True", "null", "1.0") instead of resolving
    // them as booleans, null or numbers first. Quoted keys need the value (with escapes resolved).
    if (key.type === Scalar.PLAIN && key.source !== undefined) {
        return key.source;
    }
    return String(key.value);
}

function isEmptyValue(node: YamlNode): boolean {
    return isScalar(node) && node.value === null && node.source === '' && !node.tag;
}

function getPathLocationMap(rootNode: YamlNode, source: ProjectSource): PathLocationMap {
    const pathLocationMap: Mutable<PathLocationMap> = {};

    const visit = (
        node: YamlNode | null,
        currentPath: ReadonlyArray<string | number>,
        location: MessageLocation,
    ) => {
        pathLocationMap[toJsonPointer(currentPath)] = location;
        if (isMap(node)) {
            for (const pair of node.items) {
                // conversion already rejected all other keys
                const key = pair.key as Scalar;
                const value = pair.value as YamlNode | null;
                // the location of a property spans the key and the value (or the colon if it's empty)
                const end = !value
                    ? key.range![1]
                    : isEmptyValue(value)
                      ? value.range![0]
                      : value.range![1];
                visit(
                    value,
                    [...currentPath, getKeyString(key)],
                    new MessageLocation(source, key.range![0], trimEnd(end, source)),
                );
            }
        } else if (isSeq(node)) {
            for (const [index, item] of node.items.entries()) {
                visit(
                    item as YamlNode,
                    [...currentPath, index],
                    getNodeLocation(item as YamlNode, source),
                );
            }
        }
    };

    visit(rootNode, [], getNodeLocation(rootNode, source));
    return pathLocationMap;
}

function getNodeLocation(node: YamlNode, source: ProjectSource): MessageLocation {
    // all nodes created by the parser have a range
    const [start, end] = node.range!;
    return new MessageLocation(source, start, trimEnd(end, source));
}

/**
 * Block collections end after the trailing line break - move the end back to the last relevant character
 */
function trimEnd(end: number, source: ProjectSource): number {
    while (end > 0 && /\s/.test(source.body[end - 1])) {
        end--;
    }
    return end;
}
