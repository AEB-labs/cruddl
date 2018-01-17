import { VisitAction, visitObject, Visitor } from '../utils/visitor';
import { QueryNode } from './definition';

export function visitQueryNode<T extends QueryNode>(node: T, visitor: Visitor<any>): T {
    return visitObject(node, {
        enter(node, key) {
            if (!(node instanceof QueryNode)) {
                return VisitAction.SKIP_NODE;
            }
            return visitor.enter ? visitor.enter(node, key) : node;
        },
        leave: visitor.leave
    })
};
