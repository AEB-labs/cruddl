import {
    AggregationQueryNode,
    CountQueryNode,
    EntitiesQueryNode,
    FieldQueryNode,
    FollowEdgeQueryNode,
    ObjectEntriesQueryNode,
    QueryNode,
    TransformListQueryNode,
    TraversalQueryNode,
    VariableAssignmentQueryNode,
    VariableQueryNode,
} from '../../query-tree';
import { visitQueryNode } from '../../query-tree/visitor';
import { VisitResult } from '../../utils/visitor';
import { FlexSearchQueryNode } from '../../query-tree/flex-search';

interface SupportedAsArrayExpansionOptions {
    /**
     * Set to true if you're only interested whether the field traversal (filter + map) can be implemented as array expansion
     */
    skipTopLevelChecks?: boolean;
}

/**
 * Determines whether the given traversal can (and will) be implemented using an
 * array expansion expression (as opposed to a subquery)
 */
export function supportedAsArrayExpansion(
    rootNode: TraversalQueryNode,
    { skipTopLevelChecks }: SupportedAsArrayExpansionOptions = {},
): boolean {
    // relation traversals always include subqueries
    // SORT clauses are only supported by subqueries.
    if (!skipTopLevelChecks) {
        if (rootNode.relationSegments.length > 0 || !rootNode.orderBy.isUnordered()) {
            return false;
        }
    }

    // technically we should exclude orderBy if skipTopLevelChecks is true, but we shouldn't have
    // variables etc. in order by hopefully...

    let supported = true;
    visitQueryNode(rootNode, {
        enter(currentNode): VisitResult<QueryNode> {
            if (currentNode === rootNode) {
                // don't actually want to check the root node, we did that above
                return { recurse: true, newValue: currentNode };
            }

            // don't do potential expensive checks if we already know it's unsupported from a sibling
            if (!supported) {
                return { recurse: false, newValue: currentNode };
            }

            // traversals can be nested, but only if they use array expansions, too
            if (currentNode instanceof TraversalQueryNode) {
                if (!supportedAsArrayExpansion(currentNode)) {
                    supported = false;
                }

                // the inner traversal cannot access the outer traversal's item variable because there only
                // is the CURRENT keyword which is always the innermost array expansion's item
                // (this is relevant for @parent fields)
                // specify the three properties explicitly to ignore references in sourceEntityNode
                if (
                    referencesVariable(
                        [currentNode.innerNode, currentNode.filterNode, currentNode.orderBy],
                        rootNode.itemVariable,
                    )
                ) {
                    supported = false;
                }

                // in all other cases, the nested traversal is fine
                // we never recurse because we checked it recursively in supportedAsArrayExpansion()
                return { recurse: false, newValue: currentNode };
            }

            // subqueries aren't supported in array expansions
            if (mightGenerateSubquery(currentNode)) {
                supported = false;
                return { recurse: false, newValue: currentNode };
            }

            // regular node, no issues found so far
            return { recurse: true, newValue: currentNode };
        },
    });

    return supported;
}

function mightGenerateSubquery(node: QueryNode) {
    // we assume this is not called for mutations, so we don't include those
    if (
        node instanceof FollowEdgeQueryNode ||
        node instanceof TransformListQueryNode ||
        node instanceof AggregationQueryNode ||
        node instanceof FlexSearchQueryNode ||
        node instanceof ObjectEntriesQueryNode || // TODO aql-perf: remove once refactored to not use subqueries
        node instanceof VariableAssignmentQueryNode ||
        node instanceof TraversalQueryNode // shouldn't occur because we handle that above
    ) {
        return true;
    }

    if (node instanceof CountQueryNode) {
        // these two cases result in a LENGTH(), everything else is a subquery with COLLECT WITH COUNT
        return !(
            node.listNode instanceof FieldQueryNode || node.listNode instanceof EntitiesQueryNode
        );
    }

    return false;
}

function referencesVariable(
    nodes: ReadonlyArray<QueryNode | undefined>,
    variable: VariableQueryNode,
): boolean {
    let found = false;
    for (const node of nodes) {
        if (!node) {
            continue;
        }

        visitQueryNode(node, {
            enter(currentNode): VisitResult<QueryNode> {
                if (currentNode === variable) {
                    found = true;
                    return { recurse: false, newValue: currentNode };
                }
                return { recurse: !found, newValue: currentNode };
            },
        });
    }
    return found;
}
