import {
    DeleteEntitiesQueryNode, EntitiesQueryNode, FieldQueryNode, FollowEdgeQueryNode, QueryNode, SetFieldQueryNode,
    UpdateEntitiesQueryNode
} from '../../query/definition';
import { transformFieldQueryNode } from './field';
import { AuthContext } from '../auth-basics';
import { transformEntitiesQueryNode } from './entities';
import { transformUpdateEntitiesQueryNode } from './update-entities';
import { transformDeleteEntitiesQueryNode } from './delete-entities';
import { transformFollowEdgeQueryNode } from './follow-edge';
import { transformSetFieldQueryNode } from './set-field';

type TransformFunction<T extends QueryNode> = (node: T, authContext: AuthContext) => QueryNode;

const map = new Map<Function, TransformFunction<any>>();

function addTransformer<T extends QueryNode>(clazz: {new(...a: any[]): T}, fn: TransformFunction<T>) {
    map.set(clazz, fn);
}

addTransformer(FieldQueryNode, transformFieldQueryNode);
addTransformer(EntitiesQueryNode, transformEntitiesQueryNode);
addTransformer(FollowEdgeQueryNode, transformFollowEdgeQueryNode);
addTransformer(UpdateEntitiesQueryNode, transformUpdateEntitiesQueryNode);
addTransformer(DeleteEntitiesQueryNode, transformDeleteEntitiesQueryNode);
addTransformer(SetFieldQueryNode, transformSetFieldQueryNode);

export function transformNode(node: QueryNode, authContext: AuthContext) {
    const transformer = map.get(node.constructor);
    if (transformer) {
        return transformer(node, authContext);
    }
    return node;
}
