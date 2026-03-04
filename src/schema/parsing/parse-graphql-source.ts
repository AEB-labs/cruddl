import { type DocumentNode, getLocation, GraphQLError, parse } from 'graphql';
import type { ProjectOptions } from '../../config/interfaces.js';
import { isCommentOnlySource } from '../../graphql/is-comment-only-source.js';
import {
    MessageLocation,
    SourcePosition,
    ValidationContext,
    ValidationMessage,
} from '../../model/index.js';
import { ProjectSource } from '../../project/source.js';
import { getNamespaceFromSourceName } from './namespace-from-source-name.js';
import { type ParsedGraphQLProjectSource, ParsedProjectSourceBaseKind } from './parsed-project.js';

export function parseGraphQLSource(
    projectSource: ProjectSource,
    options: ProjectOptions,
    validationContext: ValidationContext,
): ParsedGraphQLProjectSource | undefined {
    // parse() does not accept documents, and there is no option to make it accept them either
    // it would be annoying if you could not have empty files
    if (isCommentOnlySource(projectSource.body)) {
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
