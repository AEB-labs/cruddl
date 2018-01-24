import { SourceValidator } from '../ast-validator';
import { ProjectSource, SourceType } from '../../../project/source';
import { MessageLocation, SourcePosition, ValidationMessage } from '../validation-message';
import jsonLint = require('json-lint');

interface JSONLintResult {
    error?: string

    /**
     * one-based line number of the error
     */
    line?: number

    /**
     * zero-based character offset of the error
     */
    i?: number;

    /**
     * one-based column number of the error
     */
    character?: number;
}

export class CheckJsonSyntaxValidator implements SourceValidator {
    validate(source: ProjectSource): ValidationMessage[] {
        if (source.type != SourceType.JSON) {
            return [];
        }

        const result = jsonLint(source.body, { comments: true });
        if (result.error) {
            return [ ValidationMessage.error(result.error, {}, getMessageLocation(result, source)) ];
        }
        return [];
    }
}

function getMessageLocation(result: JSONLintResult, source: ProjectSource): MessageLocation|undefined {
    if (!result.line || !result.i || !result.character) {
        return undefined;
    }
    const endOffset = source.body.length;
    const endLoc = end(source.body);
    return new MessageLocation(source.name,
        new SourcePosition(result.i, result.line, result.character),
        new SourcePosition(endOffset, endLoc.line, endLoc.column));
}

function end(str: string) {
    const lines = str.split('\n');
    return {
        line: lines.length || 1,
        column: lines.length ? (lines[lines.length - 1].length || 1) : 1
    };
}
