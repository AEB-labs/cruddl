import { visitObject, Visitor, VisitResult } from '../utils/visitor';
import { QueryNode } from './definition';

export function visitQueryNode(node: QueryNode, visitor: Visitor<QueryNode>): QueryNode {
    return visitObject(node, {
        enter(node, key): VisitResult<QueryNode> {
            if (!(node instanceof QueryNode)) {
                return { newValue: node, recurse: false };
            }
            if (!visitor.enter) {
                return { newValue: node };
            }
            return visitor.enter(node, key);
        },
        leave(node, key) {
            if (!(node instanceof QueryNode)) {
                return node;
            }
            if (!visitor.leave) {
                return node;
            }
            return visitor.leave(node, key);
        },
    })
}
