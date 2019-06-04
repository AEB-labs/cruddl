import { GraphQLError } from 'graphql';
import { isListTypeIgnoringNonNull } from '../graphql/schema-utils';
import { FieldContext } from './query-node-object-type';

export function createGraphQLError(message: string, { selectionStack }: FieldContext) {
    if (!selectionStack.length) {
        throw new GraphQLError(message);
    }
    // theoretically, we could be more specific than the (output) field node, but that would need to differentiate
    // between variables and in-query-string values which would make the schema-generating code more complex
    const nodes = selectionStack[selectionStack.length - 1].fieldRequest.fieldNodes;

    // normally, these kinds of errors would not have a path at all, but we can't *not* set it if we throw the error
    // in the resolver, and having a totally wrong path is worse than having a mostly-correct path
    // (graphql would set the path to the top-level field which does not make sense for us)
    const path = selectionStack.reduce<ReadonlyArray<string | number>>((path, sel) => {
        // these are validation errors so we don't have actual list indices; but we shouldn't just ignore it
        // we don't have nested lists
        if (isListTypeIgnoringNonNull(sel.fieldRequest.field.type)) {
            return [...path, sel.propertyName, 0];
        }
        return [...path, sel.propertyName];
    }, []);

    return new GraphQLError(message, nodes, undefined, undefined, path);
}
