import {
    DirectiveNode,
    FieldNode,
    FragmentDefinitionNode,
    GraphQLIncludeDirective,
    GraphQLSkipDirective,
    SelectionNode
} from 'graphql';
import { getArgumentValues } from './argument-values';

/**
 * Collects all fields selected by the given selection node
 *
 * For field nodes, this is just the field node
 * For fragments, this is all the fields requested by the fragment (recursively)
 *
 * This is basically the same as graphql-js' collectFields()
 * https://github.com/graphql/graphql-js/blob/d052f6597b88eae1c06b3c9a7c74434878dde902/src/execution/execute.js#L406
 *
 * We need to duplicate the logic here because graphql-js only supports pulling fields one after the other via the
 * resolve callbacks, but we need to build the whole query structure before any data has been resolved
 *
 * This is similar to expandSelections from language-utils but does a shouldIncludeNode filter at each level
 */
export function resolveSelections(
    selections: ReadonlyArray<SelectionNode>,
    context: {
        readonly variableValues: { readonly [key: string]: unknown };
        readonly fragments: { readonly [key: string]: FragmentDefinitionNode | undefined };
    }
): ReadonlyArray<FieldNode> {
    const visitedFragmentNames = new Set<string>();
    const nodes: FieldNode[] = [];

    function walk(selections: ReadonlyArray<SelectionNode>) {
        for (const selection of selections) {
            // Here,
            if (!shouldIncludeNode(selection.directives || [], context.variableValues)) {
                continue;
            }

            switch (selection.kind) {
                case 'Field':
                    nodes.push(selection);
                    break;
                case 'InlineFragment':
                    walk(selection.selectionSet.selections);
                    break;
                case 'FragmentSpread':
                    const fragmentName = selection.name.value;
                    if (visitedFragmentNames.has(fragmentName)) {
                        continue;
                    }
                    visitedFragmentNames.add(fragmentName);
                    const fragment = context.fragments[fragmentName];
                    if (!fragment) {
                        throw new Error(`Fragment ${fragmentName} was queried but not defined`);
                    }
                    walk(fragment.selectionSet.selections);
                    break;
            }
        }
        return nodes;
    }

    return walk(selections);
}

/**
 * Determines if a FieldNode should be included based on its directives
 *
 * Copied from (slightly modified):
 * https://github.com/graphql/graphql-js/blob/d052f6597b88eae1c06b3c9a7c74434878dde902/src/execution/execute.js#L472
 *
 *
 * @param directives the directives of the field node
 * @param variableValues variables supplied to the query
 * @returns true if the node should be included, false if it should be skipped
 */
export function shouldIncludeNode(directives: ReadonlyArray<DirectiveNode>, variableValues: { [key: string]: any }) {
    const skipNode = directives.find(d => d.name.value == GraphQLSkipDirective.name);
    if (skipNode) {
        const { if: skipIf } = getArgumentValues(GraphQLSkipDirective, skipNode, variableValues);
        if (skipIf === true) {
            return false;
        }
    }

    const includeNode = directives.find(d => d.name.value == GraphQLIncludeDirective.name);
    if (includeNode) {
        const { if: includeIf } = getArgumentValues(GraphQLIncludeDirective, includeNode, variableValues);
        if (includeIf === false) {
            return false;
        }
    }

    return true;
}
