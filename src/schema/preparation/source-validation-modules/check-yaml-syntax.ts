import { SourceValidator } from '../ast-validator';
import { ProjectSource, SourceType } from '../../../project/source';
import { MessageLocation, SourcePosition, ValidationMessage } from '../validation-message';
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
    if (!error.mark || !error.mark.column || !error.mark.line || !error.mark.position) {
        return undefined;
    }
    const endOffset = error.source.body.length;
    const endLoc = end(source.body);
    return new MessageLocation(source.name,
        new SourcePosition(error.mark.position, error.mark.line, error.mark.column),
        new SourcePosition(endOffset, endLoc.line, endLoc.column));
}

function end(str: string) {
    const lines = str.split('\n');
    return {
        line: lines.length || 1,
        column: lines.length ? lines[lines.length - 1].length : 1
    };
}
