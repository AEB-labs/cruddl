import { DeleteEntitiesQueryNode, QueryNode, UpdateEntitiesQueryNode } from '../../query-tree';
import { visitQueryNode } from '../../query-tree/visitor';
import { VisitResult } from '../../utils/visitor';

export function hasRevisionAssertions(node: QueryNode) {
    let hasRevisionAssertions = false;
    visitQueryNode(node, {
        enter(object: QueryNode, key: string | undefined): VisitResult<QueryNode> {
            if (
                (object instanceof DeleteEntitiesQueryNode || object instanceof UpdateEntitiesQueryNode) &&
                object.revision
            ) {
                hasRevisionAssertions = true;
                return {
                    recurse: false,
                    newValue: object
                };
            }
            return {
                // if we already found one, we don't need to recursive deeper
                recurse: !hasRevisionAssertions,
                newValue: object
            };
        }
    });
    return hasRevisionAssertions;
}
