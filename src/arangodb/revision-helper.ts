import type { QueryNode } from '../core/query-tree/base.js';
import { DeleteEntitiesQueryNode, UpdateEntitiesQueryNode } from '../core/query-tree/mutations.js';
import { visitQueryNode } from '../core/query-tree/visitor.js';
import type { VisitResult } from '../core/utils/visitor.js';

export function hasRevisionAssertions(node: QueryNode) {
    let hasRevisionAssertions = false;
    visitQueryNode(node, {
        enter(object: QueryNode, key: string | undefined): VisitResult<QueryNode> {
            if (
                (object instanceof DeleteEntitiesQueryNode ||
                    object instanceof UpdateEntitiesQueryNode) &&
                object.revision
            ) {
                hasRevisionAssertions = true;
                return {
                    recurse: false,
                    newValue: object,
                };
            }
            return {
                // if we already found one, we don't need to recursive deeper
                recurse: !hasRevisionAssertions,
                newValue: object,
            };
        },
    });
    return hasRevisionAssertions;
}
