import { FlexSearchQueryNode } from '../../query-tree/flex-search.js';
import type { QueryNode } from '../../query-tree/index.js';
import {
    AffectedFieldInfoQueryNode,
    CreateEntitiesQueryNode,
    CreateEntityQueryNode,
    DeleteEntitiesQueryNode,
    EntitiesQueryNode,
    EntityFromIdQueryNode,
    FieldPathQueryNode,
    FieldQueryNode,
    FollowEdgeQueryNode,
    TraversalQueryNode,
    UpdateEntitiesQueryNode,
} from '../../query-tree/index.js';
import type { AuthContext } from '../auth-basics.js';
import { transformAffectedFieldInfoQueryNode } from './affected-field-info.js';
import { transformCreateEntitiesQueryNode } from './create-entities.js';
import { transformCreateEntityQueryNode } from './create-entity.js';
import {
    transformEntitiesQueryNode,
    transformEntityFromIdQueryNode,
    transformFlexSearchQueryNode,
} from './entities.js';
import { transformFieldPathQueryNode, transformFieldQueryNode } from './field.js';
import { transformFollowEdgeQueryNode } from './follow-edge.js';
import { transformTraversalQueryNode } from './traversal.js';
import {
    transformDeleteEntitiesQueryNode,
    transformUpdateEntitiesQueryNode,
} from './update-delete-entities.js';

type TransformFunction<T extends QueryNode> = (node: T, authContext: AuthContext) => QueryNode;

const map = new Map<Function, TransformFunction<any>>();

function addTransformer<T extends QueryNode>(
    clazz: { new (...a: any[]): T },
    fn: TransformFunction<T>,
) {
    map.set(clazz, fn);
}

addTransformer(FieldQueryNode, transformFieldQueryNode);
addTransformer(EntityFromIdQueryNode, transformEntityFromIdQueryNode);
addTransformer(EntitiesQueryNode, transformEntitiesQueryNode);
addTransformer(FollowEdgeQueryNode, transformFollowEdgeQueryNode);
addTransformer(TraversalQueryNode, transformTraversalQueryNode);
addTransformer(CreateEntityQueryNode, transformCreateEntityQueryNode);
addTransformer(CreateEntitiesQueryNode, transformCreateEntitiesQueryNode);
addTransformer(UpdateEntitiesQueryNode, transformUpdateEntitiesQueryNode);
addTransformer(DeleteEntitiesQueryNode, transformDeleteEntitiesQueryNode);
addTransformer(AffectedFieldInfoQueryNode, transformAffectedFieldInfoQueryNode);
addTransformer(FlexSearchQueryNode, transformFlexSearchQueryNode);
addTransformer(FieldPathQueryNode, transformFieldPathQueryNode);

export function transformNode(node: QueryNode, authContext: AuthContext): QueryNode {
    const transformer = map.get(node.constructor);
    if (transformer) {
        return transformer(node, authContext);
    }
    return node;
}
