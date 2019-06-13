import {
    AffectedFieldInfoQueryNode, CreateEntityQueryNode, DeleteEntitiesQueryNode, EntitiesQueryNode, EntityFromIdQueryNode, FieldPathQueryNode, FieldQueryNode,
    FollowEdgeQueryNode,
    QueryNode, TraversalQueryNode, UpdateEntitiesQueryNode
} from '../../query-tree';
import { QuickSearchQueryNode } from '../../query-tree/quick-search';
import { AuthContext } from '../auth-basics';
import { transformAffectedFieldInfoQueryNode } from './affected-field-info';
import { transformCreateEntityQueryNode } from './create-entity';
import { transformEntitiesQueryNode, transformEntityFromIdQueryNode, transformQuickSearchQueryNode } from './entities';
import { transformFieldPathQueryNode, transformFieldQueryNode } from './field';
import { transformFollowEdgeQueryNode } from './follow-edge';
import { transformTraversalQueryNode } from './traversal';
import { transformDeleteEntitiesQueryNode, transformUpdateEntitiesQueryNode } from './update-delete-entities';

type TransformFunction<T extends QueryNode> = (node: T, authContext: AuthContext) => QueryNode;

const map = new Map<Function, TransformFunction<any>>();

function addTransformer<T extends QueryNode>(clazz: { new(...a: any[]): T }, fn: TransformFunction<T>) {
    map.set(clazz, fn);
}

addTransformer(FieldQueryNode, transformFieldQueryNode);
addTransformer(EntityFromIdQueryNode, transformEntityFromIdQueryNode);
addTransformer(EntitiesQueryNode, transformEntitiesQueryNode);
addTransformer(FollowEdgeQueryNode, transformFollowEdgeQueryNode);
addTransformer(TraversalQueryNode, transformTraversalQueryNode);
addTransformer(CreateEntityQueryNode, transformCreateEntityQueryNode);
addTransformer(UpdateEntitiesQueryNode, transformUpdateEntitiesQueryNode);
addTransformer(DeleteEntitiesQueryNode, transformDeleteEntitiesQueryNode);
addTransformer(AffectedFieldInfoQueryNode, transformAffectedFieldInfoQueryNode);
addTransformer(QuickSearchQueryNode, transformQuickSearchQueryNode);
addTransformer(FieldPathQueryNode, transformFieldPathQueryNode);

export function transformNode(node: QueryNode, authContext: AuthContext): QueryNode {
    const transformer = map.get(node.constructor);
    if (transformer) {
        return transformer(node, authContext);
    }
    return node;
}
