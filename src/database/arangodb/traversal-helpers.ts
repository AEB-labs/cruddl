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
} from '../../query-tree';
import { visitQueryNode } from '../../query-tree/visitor';
import { VisitResult } from '../../utils/visitor';
import { FlexSearchQueryNode } from '../../query-tree/flex-search';

/**
 * Determines whether the AQL for a given node might produce a subquery somewhere
 *
 * If in doubt, this will return true.
 *
 * Used to determine whether an array expansion expression can be used, because they don't support
 * nested subqueries.
 */
export function mightGenerateSubquery(node: QueryNode) {
    let foundPotentialSubquery = false;
    visitQueryNode(node, {
        enter(currentNode): VisitResult<QueryNode> {
            if (mightGenerateSubqueryShallow(currentNode)) {
                foundPotentialSubquery = true;
            }
            return { recurse: !foundPotentialSubquery, newValue: currentNode };
        },
    });
    return foundPotentialSubquery;
}

function mightGenerateSubqueryShallow(node: QueryNode) {
    // we assume this is not called for mutations, so we don't include those
    if (
        node instanceof FollowEdgeQueryNode ||
        node instanceof TransformListQueryNode ||
        node instanceof AggregationQueryNode ||
        node instanceof FlexSearchQueryNode ||
        node instanceof ObjectEntriesQueryNode || // TODO aql-perf: remove once refactored to not use subqueries
        node instanceof VariableAssignmentQueryNode
    ) {
        return true;
    }

    if (node instanceof CountQueryNode) {
        // these two cases result in a LENGTH(), everything else is a subquery with COLLECT WITH COUNT
        return !(
            node.listNode instanceof FieldQueryNode || node.listNode instanceof EntitiesQueryNode
        );
    }

    if (node instanceof TraversalQueryNode) {
        // relation traversals always include subqueries
        if (node.relationSegments.length > 0) {
            return true;
        }

        // SORT clauses are only supported by subqueries.
        // Without ordering, we always generate expressions
        return !node.orderBy.isUnordered();
    }

    return false;
}
