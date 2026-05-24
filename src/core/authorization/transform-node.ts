import type { QueryNode } from '../query-tree/base.js';
import { FlexSearchQueryNode } from '../query-tree/flex-search.js';
import {
    AffectedFieldInfoQueryNode,
    CreateEntitiesQueryNode,
    CreateEntityQueryNode,
    DeleteEntitiesQueryNode,
    UpdateEntitiesQueryNode,
} from '../query-tree/mutations.js';
import {
    EntitiesQueryNode,
    EntityFromIdQueryNode,
    FieldPathQueryNode,
    FieldQueryNode,
    FollowEdgeQueryNode,
    TraversalQueryNode,
} from '../query-tree/queries.js';
import { VectorSearchQueryNode } from '../query-tree/vector-search.js';
import type { AuthContext } from './auth-basics.js';
import { transformAffectedFieldInfoQueryNode } from './transformers/affected-field-info.js';
import { transformCreateEntitiesQueryNode } from './transformers/create-entities.js';
import { transformCreateEntityQueryNode } from './transformers/create-entity.js';
import {
    transformEntitiesQueryNode,
    transformEntityFromIdQueryNode,
    transformFlexSearchQueryNode,
} from './transformers/entities.js';
import { transformFieldPathQueryNode, transformFieldQueryNode } from './transformers/field.js';
import { transformFollowEdgeQueryNode } from './transformers/follow-edge.js';
import { transformTraversalQueryNode } from './transformers/traversal.js';
import {
    transformDeleteEntitiesQueryNode,
    transformUpdateEntitiesQueryNode,
} from './transformers/update-delete-entities.js';
import { transformVectorSearchQueryNode } from './transformers/vector-search.js';

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
addTransformer(VectorSearchQueryNode, transformVectorSearchQueryNode);

export function transformNode(node: QueryNode, authContext: AuthContext): QueryNode {
    const transformer = map.get(node.constructor);
    if (transformer) {
        return transformer(node, authContext);
    }
    return node;
}
