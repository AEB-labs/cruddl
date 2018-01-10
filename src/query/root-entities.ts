import { GraphQLObjectType } from 'graphql';
import { getPermissionDescriptor } from '../authorization/permission-descriptors-in-schema';
import { AccessOperation, AuthContext } from '../authorization/auth-basics';
import {
    EntitiesQueryNode, FieldQueryNode, ListQueryNode, TransformListQueryNode, VariableQueryNode
} from './definition';
import { PermissionResult } from '../authorization/permission-descriptors';

export function createAuthenticatedRootEntitiesQuery(rootEntity: GraphQLObjectType, authContext: AuthContext) {
    const permissionDescriptor = getPermissionDescriptor(rootEntity);
    if (!permissionDescriptor) {
        throw new Error(`Permission descriptor of root entity ${rootEntity.name} missing`);
    }
    const access = permissionDescriptor.canAccess(authContext, AccessOperation.READ);
    switch (access) {
        case PermissionResult.DENIED:
            return new ListQueryNode([]);
        case PermissionResult.GRANTED:
            return new EntitiesQueryNode(rootEntity);
        default:
            const accessGroupField = rootEntity.getFields()['accessGroup'];
            if (!accessGroupField) {
                throw new Error(`Root entity ${rootEntity.name} has an accessGroup-based permission profile, but no accessGroup field`);
            }
            const itemVar = new VariableQueryNode('item');
            const accessGroupNode = new FieldQueryNode(itemVar, accessGroupField);
            const condition = permissionDescriptor.getAccessCondition(authContext, AccessOperation.READ, accessGroupNode);
            return new TransformListQueryNode({
                listNode: new EntitiesQueryNode(rootEntity),
                filterNode: condition,
                itemVariable: itemVar
            });
    }
}
