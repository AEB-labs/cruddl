import { SourceValidator } from '../ast-validator';
import { ProjectSource, SourceType } from '../../../project/source';
import { MessageLocation, SourcePosition, ValidationMessage } from '../../../model';
import { getLocation, GraphQLError, parse, Source } from 'graphql';

export class CheckGraphQLSyntaxValidator implements SourceValidator {
    validate(source: ProjectSource): ValidationMessage[] {
        if (source.type != SourceType.GRAPHQLS) {
            return [];
        }

        try {
            parse(new Source(source.body, source.name));
        } catch (e) {
            if (e instanceof GraphQLError) {
                const message = getMessageFromSyntaxError(e);
                const location = getMessageLocation(e);
                return [
                    ValidationMessage.error(message, {}, location)
                ]
            }
            throw e;
        }
        return [];
    }
}

function getMessageFromSyntaxError(error: GraphQLError): string {
    const captures = error.message.match(/^Syntax Error .* \(\d+:\d+\) (.*)/);
    if (captures) {
        return captures[1];
    }
    return error.message;
}

function getMessageLocation(error: GraphQLError): MessageLocation|undefined {
    if (!error.source || !error.locations || !error.locations.length || !error.positions || !error.positions.length) {
        return undefined;
    }
    const endOffset = error.source.body.length;
    const endLoc = getLocation(error.source, endOffset);
    return new MessageLocation(ProjectSource.fromGraphQLSource(error.source) || error.source.name,
        new SourcePosition(error.positions[0], error.locations[0].line, error.locations[0].column),
        new SourcePosition(endOffset, endLoc.line, endLoc.column));
}
