import {
    BinaryOperationQueryNode, BinaryOperator, ConstBoolQueryNode, FieldQueryNode, LiteralQueryNode, QueryNode,
    UnknownValueQueryNode
} from '../query/definition';
import { simplifyBooleans } from '../query/query-tree-utils';
import { PermissionProfile } from './permission-profile';
import { flatMap } from 'lodash';
import { AccessOperation, AuthContext } from './auth-basics';
import { GraphQLField, GraphQLObjectType } from 'graphql';
import { ACCESS_GROUP_FIELD } from '../schema/schema-defaults';

/**
 * Determines whether a user can access information, possibly dependent on the instance containing the information
 */
export abstract class PermissionDescriptor {
    /**
     * Gets the condition which determines if a user has access
     * @param authContext
     * @param operation
     * @param instanceNode a QueryNode which evaluates to the instance
     * @returns a QueryNode that evaluates to TRUE if the user has access or FALSE if they don't
     */
    abstract getAccessCondition(authContext: AuthContext, operation: AccessOperation, instanceNode: QueryNode): QueryNode;

    /**
     * Determines if a user has access or if it depends on the instance
     */
    canAccess(authContext: AuthContext, operation: AccessOperation): PermissionResult {
        const condition = simplifyBooleans(this.getAccessCondition(authContext, operation, new UnknownValueQueryNode()));
        if (condition instanceof ConstBoolQueryNode) {
            return condition.value ? PermissionResult.GRANTED : PermissionResult.DENIED;
        }
        return PermissionResult.CONDITIONAL;
    }
}

export enum PermissionResult {
    /**
     * Access is granted for all instances
     */
    GRANTED,

    /**
     * Access may be granted or denied, depending on the instance's accessGroup
     */
    CONDITIONAL,

    /**
     * Access is denied for all instances
     */
    DENIED
}

export class AlwaysGrantPermissionDescriptor extends PermissionDescriptor {
    getAccessCondition(authContext: AuthContext, operation: AccessOperation): QueryNode {
        return ConstBoolQueryNode.TRUE;
    }

    canAccess(authContext: AuthContext, operation: AccessOperation): PermissionResult {
        return PermissionResult.GRANTED;
    }

    static INSTANCE = new AlwaysGrantPermissionDescriptor();
}

export class ConjunctivePermissionDescriptor extends PermissionDescriptor {
    constructor(public readonly lhs: PermissionDescriptor, public readonly rhs: PermissionDescriptor) {
        super();
    }

    getAccessCondition(authContext: AuthContext, operation: AccessOperation): QueryNode {
        const unknownAccessGroup = new UnknownValueQueryNode();
        return simplifyBooleans(new BinaryOperationQueryNode(
            this.lhs.getAccessCondition(authContext, operation, unknownAccessGroup),
            BinaryOperator.AND,
            this.rhs.getAccessCondition(authContext, operation, unknownAccessGroup)
        ));
    }
}

export class StaticPermissionDescriptor extends PermissionDescriptor {
    private allReadRoles: string[];

    constructor(public readonly readRoles: string[], public readonly readWriteRoles: string[]) {
        super();
        this.allReadRoles = [...readRoles, ...readWriteRoles];
    }

    getAccessCondition(authContext: AuthContext, operation: AccessOperation): QueryNode {
        let roles: string[] = [];
        switch (operation) {
            case AccessOperation.READ:
                roles = this.allReadRoles;
                break;
            case AccessOperation.WRITE:
                roles = this.readWriteRoles;
        }
        const allowed = roles.some(allowedRole => authContext.authRoles.includes(allowedRole));
        return new ConstBoolQueryNode(allowed);
    }
}

export class ProfileBasedPermissionDescriptor extends PermissionDescriptor {
    private accessGroupField: GraphQLField<any, any>|undefined;

    constructor(private profile: PermissionProfile, private readonly objectType: GraphQLObjectType) {
        super();
        this.accessGroupField = objectType.getFields()[ACCESS_GROUP_FIELD];
    }

    getAccessCondition(authContext: AuthContext, operation: AccessOperation, instanceNode: QueryNode): QueryNode {
        const applicablePermissions = this.profile.permissions
            .filter(permission => permission.allowsOperation(operation) && permission.appliesToAuthContext(authContext));

        if (!applicablePermissions.length) {
            return ConstBoolQueryNode.FALSE;
        }

        if (applicablePermissions.some(permission => !permission.restrictToAccessGroups)) {
            return ConstBoolQueryNode.TRUE;
        }

        const allowedAccessGroups = flatMap(applicablePermissions, permission => permission.restrictToAccessGroups!);
        if (!this.accessGroupField) {
            throw new Error(`Using accessGroup-restricted permission profile on type ${this.objectType.name} which does not have an accessGroup field`);
        }
        const accessGroupNode = new FieldQueryNode(instanceNode, this.accessGroupField, this.objectType);
        return new BinaryOperationQueryNode(accessGroupNode, BinaryOperator.IN, new LiteralQueryNode(allowedAccessGroups));
    }
}
