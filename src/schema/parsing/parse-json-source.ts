import {
    getNodeValue,
    parseTree,
    printParseErrorCode,
    type Node as JsonNode,
    type ParseError,
} from 'jsonc-parser';
import type { ProjectOptions } from '../../config/interfaces.js';
import { MessageLocation, ValidationContext, ValidationMessage } from '../../model/index.js';
import { ProjectSource } from '../../project/source.js';
import { type PlainObject } from '../../utils/utils.js';
import { getNamespaceFromSourceName } from './namespace-from-source-name.js';
import {
    ParsedProjectSourceBaseKind,
    type ParsedObjectProjectSource,
    type PathLocationMap,
} from './parsed-project.js';

export function parseJSONSource(
    projectSource: ProjectSource,
    options: ProjectOptions,
    validationContext: ValidationContext,
): ParsedObjectProjectSource | undefined {
    if (projectSource.body.trim() === '') {
        return undefined;
    }

    // perform general JSON syntax check
    const parseErrors: ParseError[] = [];
    const rootNode = parseTree(projectSource.body, parseErrors, {
        allowTrailingComma: false,
        disallowComments: false,
    });

    if (parseErrors.length) {
        for (const parseError of parseErrors) {
            const loc = new MessageLocation(
                projectSource,
                parseError.offset,
                projectSource.body.length,
            );
            validationContext.addMessage(
                ValidationMessage.error(
                    getMessageFromJSONSyntaxError(projectSource.body, parseError),
                    loc,
                ),
            );
        }
        // returning undefined will lead to ignoring this source file in future steps
        return undefined;
    }

    if (!rootNode) {
        return undefined;
    }

    const jsonPathLocationMap = getPathLocationMap(rootNode, projectSource);
    const data = getNodeValue(rootNode);

    if (typeof data !== 'object') {
        validationContext.addMessage(
            ValidationMessage.error(
                `JSON file should define an object (is ${typeof data})`,
                new MessageLocation(projectSource, 0, projectSource.body.length),
            ),
        );
        return undefined;
    }

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

function getPathLocationMap(rootNode: JsonNode, source: ProjectSource): PathLocationMap {
    const pathLocationMap: { [path: string]: MessageLocation } = {};

    const visit = (node: JsonNode, currentPath: ReadonlyArray<string | number>) => {
        pathLocationMap[toJsonPointer(currentPath)] = new MessageLocation(
            source,
            node.offset,
            node.offset + node.length,
        );

        if (node.type === 'object') {
            for (const propertyNode of node.children ?? []) {
                const keyNode = propertyNode.children?.[0];
                const valueNode = propertyNode.children?.[1];
                if (!keyNode || !valueNode || keyNode.type !== 'string') {
                    continue;
                }
                visit(valueNode, [...currentPath, keyNode.value as string]);
            }
        } else if (node.type === 'array') {
            for (const [index, childNode] of (node.children ?? []).entries()) {
                visit(childNode, [...currentPath, index]);
            }
        }
    };

    visit(rootNode, []);
    return pathLocationMap;
}

function toJsonPointer(path: ReadonlyArray<string | number>): string {
    // https://datatracker.ietf.org/doc/html/rfc6901
    return path.map((part) => '/' + escapeJsonPointer(String(part))).join('');
}

function escapeJsonPointer(part: string): string {
    // defined by https://datatracker.ietf.org/doc/html/rfc6901#section-3
    return part.replace(/~/g, '~0').replace(/\//g, '~1');
}

export function getMessageFromJSONSyntaxError(source: string, error: ParseError): string {
    const errorCode = printParseErrorCode(error.error);
    const symbol = source[error.offset] ?? '';

    switch (errorCode) {
        case 'InvalidSymbol':
            if (error.offset === 0) {
                return `Unknown character '${symbol}', expecting opening block '{' or '[', or maybe a comment`;
            }
            return `Unknown character '${symbol}', expecting a comma or a closing '}'`;
        case 'InvalidNumberFormat':
            return 'Invalid number format.';
        case 'PropertyNameExpected':
            return 'Property name expected.';
        case 'ValueExpected':
            return 'Value expected.';
        case 'ColonExpected':
            return `Colon ':' expected.`;
        case 'CommaExpected':
            return `Comma ',' expected.`;
        case 'CloseBraceExpected':
            return `Closing brace '}' expected.`;
        case 'CloseBracketExpected':
            return `Closing bracket ']' expected.`;
        case 'EndOfFileExpected':
            return 'End of file expected.';
        case 'InvalidCommentToken':
            return 'Invalid comment token.';
        case 'UnexpectedEndOfComment':
            return 'Unexpected end of comment.';
        case 'UnexpectedEndOfString':
            return 'Unexpected end of string.';
        case 'UnexpectedEndOfNumber':
            return 'Unexpected end of number.';
        case 'InvalidUnicode':
            return 'Invalid unicode escape sequence.';
        case 'InvalidEscapeCharacter':
            return 'Invalid escape character.';
        case 'InvalidCharacter':
            return 'Invalid character.';
        default:
            return `JSON syntax error: ${errorCode}`;
    }
}
