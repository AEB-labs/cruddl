import { SourceValidator } from '../ast-validator';
import { ProjectSource, SourceType } from '../../../project/source';
import { MessageLocation, SourcePosition, ValidationMessage } from '../../../model/validation/message';
import { getLocation, GraphQLError, parse, Source } from 'graphql';
import { load, YAMLException } from 'js-yaml';

export class CheckYamlSyntaxValidator implements SourceValidator {
    validate(source: ProjectSource): ValidationMessage[] {
        if (source.type != SourceType.YAML) {
            return [];
        }

        try {
            load(source.body);
        } catch (e) {
            if (e instanceof YAMLException) {
                const message = (e as any).reason || e.message;
                const location = getMessageLocation(e, source);
                return [
                    ValidationMessage.error(message, {}, location)
                ]
            }
            throw e;
        }
        return [];
    }
}

function getMessageLocation(error: any, source: ProjectSource): MessageLocation|undefined {
    if (!error.mark || typeof error.mark.column != 'number' || typeof error.mark.line != 'number' || typeof error.mark.position != 'number') {
        return undefined;
    }
    const endOffset = source.body.length;
    const endLoc = end(source.body);
    return new MessageLocation(source,
        new SourcePosition(error.mark.position, error.mark.line + 1, error.mark.column + 1),
        new SourcePosition(endOffset, endLoc.line, endLoc.column));
}

function end(str: string) {
    const lines = str.split('\n');
    return {
        line: lines.length || 1,
        column: (lines[lines.length - 1] || '').length + 1
    };
}
