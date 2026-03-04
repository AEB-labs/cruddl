import { parse as JSONparse } from 'json-source-map';
import { parse, type ParseError, printParseErrorCode } from 'jsonc-parser';
import stripJsonComments from 'strip-json-comments';
import type { ProjectOptions } from '../../config/interfaces.js';
import { MessageLocation, ValidationContext, ValidationMessage } from '../../model/index.js';
import { ProjectSource } from '../../project/source.js';
import { type PlainObject } from '../../utils/utils.js';
import { getNamespaceFromSourceName } from './namespace-from-source-name.js';
import { type ParsedObjectProjectSource, ParsedProjectSourceBaseKind } from './parsed-project.js';

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
    parse(projectSource.body, parseErrors, {
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

    const data = parseResult.data;

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
