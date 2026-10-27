import { FieldPath } from '../model/implementation/field-path.js';
import type { Field } from '../model/implementation/field.js';
import type { Permission, PermissionProfile } from '../model/implementation/permission-profile.js';
import type { RootEntityType } from '../model/implementation/root-entity-type.js';
import type { QueryNode } from '../query-tree/base.js';
import { UnknownValueQueryNode } from '../query-tree/errors.js';
import { ListQueryNode } from '../query-tree/lists.js';
import { ConstBoolQueryNode, LiteralQueryNode } from '../query-tree/literals.js';
import {
    MergeObjectsQueryNode,
    ObjectQueryNode,
    PropertySpecification,
} from '../query-tree/objects.js';
import {
    BinaryOperationQueryNode,
    BinaryOperator,
    ConditionalQueryNode,
} from '../query-tree/operators.js';
import { QuantifierFilterNode } from '../query-tree/quantifiers.js';
import { FieldQueryNode } from '../query-tree/queries.js';
import { BasicType, TypeCheckQueryNode } from '../query-tree/type-check.js';
import { simplifyBooleans } from '../query-tree/utils/simplify-booleans.js';
import { VariableQueryNode } from '../query-tree/variables.js';
import { createFieldPathNode } from '../schema-generation/field-path-node.js';
import { ACCESS_GROUP_FIELD } from '../schema/constants.js';
import { isReadonlyArray } from '../utils/utils.js';
import type { AuthContext } from './auth-basics.js';
import { AccessOperation } from './auth-basics.js';

export enum ConditionExplanationContext {
    BEFORE_WRITE,
    SET,
}

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
    abstract getAccessCondition(
        authContext: AuthContext,
        operation: AccessOperation,
        instanceNode: QueryNode,
    ): QueryNode;

    /**
     * Determines if a user has access or if it depends on the instance
     */
    canAccess(authContext: AuthContext, operation: AccessOperation): PermissionResult {
        const condition = simplifyBooleans(
            this.getAccessCondition(authContext, operation, new UnknownValueQueryNode()),
        );
        if (condition instanceof ConstBoolQueryNode) {
            return condition.value ? PermissionResult.GRANTED : PermissionResult.DENIED;
        }
        return PermissionResult.CONDITIONAL;
    }

    /**
     * Gets a condition that checks that all items that are added to or removed from list fields used in
     * restrictions would be permitted on their own
     *
     * This prevents users from granting or revoking access to objects for values they don't have access to
     * themselves. The regular access condition only requires one list item to match.
     *
     * Each changed item is checked by evaluating the access condition on the new instance with the list replaced
     * by just that item. Thus, if a permission grants access to the new instance without restricting the list
     * field, all changes to the list are allowed. Otherwise, each changed item needs to match the restriction on
     * the list field of a permission whose other restrictions match the new instance.
     *
     * @param authContext
     * @param operation
     * @param oldInstanceNode a QueryNode that evaluates to the instance before the change, or undefined if the
     * instance is created
     * @param newInstanceNode a QueryNode that evaluates to the instance after the change
     * @param isFieldPathAffected can be used to skip list fields that are known not to be changed
     * @returns a QueryNode that evaluates to TRUE if the change is allowed or FALSE if it isn't
     */
    getListChangeCondition(
        authContext: AuthContext,
        operation: AccessOperation,
        oldInstanceNode: QueryNode | undefined,
        newInstanceNode: QueryNode,
        isFieldPathAffected?: (fields: ReadonlyArray<Field>) => boolean,
    ): QueryNode {
        return ConstBoolQueryNode.TRUE;
    }

    /**
     * Gets a human-readable explanation fragment that explains why some instance could not be accessed
     */
    getExplanationForCondition(
        authContext: AuthContext,
        operation: AccessOperation,
        context: ConditionExplanationContext,
    ): string | undefined {
        return undefined;
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
    DENIED,
}

export class AlwaysGrantPermissionDescriptor extends PermissionDescriptor {
    getAccessCondition(authContext: AuthContext, operation: AccessOperation): QueryNode {
        return ConstBoolQueryNode.TRUE;
    }

    canAccess(authContext: AuthContext, operation: AccessOperation): PermissionResult {
        return PermissionResult.GRANTED;
    }

    static readonly INSTANCE = new AlwaysGrantPermissionDescriptor();
}

export class AlwaysDenyPermissionDescriptor extends PermissionDescriptor {
    getAccessCondition(authContext: AuthContext, operation: AccessOperation): QueryNode {
        return ConstBoolQueryNode.FALSE;
    }

    canAccess(authContext: AuthContext, operation: AccessOperation): PermissionResult {
        return PermissionResult.DENIED;
    }

    static readonly INSTANCE = new AlwaysDenyPermissionDescriptor();
}

export class ConjunctivePermissionDescriptor extends PermissionDescriptor {
    constructor(
        public readonly lhs: PermissionDescriptor,
        public readonly rhs: PermissionDescriptor,
    ) {
        super();
    }

    getAccessCondition(authContext: AuthContext, operation: AccessOperation): QueryNode {
        const unknownAccessGroup = new UnknownValueQueryNode();
        return simplifyBooleans(
            new BinaryOperationQueryNode(
                this.lhs.getAccessCondition(authContext, operation, unknownAccessGroup),
                BinaryOperator.AND,
                this.rhs.getAccessCondition(authContext, operation, unknownAccessGroup),
            ),
        );
    }
}

export class StaticPermissionDescriptor extends PermissionDescriptor {
    private readonly allReadRoles: ReadonlyArray<string>;

    constructor(
        public readonly readRoles: ReadonlyArray<string>,
        public readonly readWriteRoles: ReadonlyArray<string>,
    ) {
        super();
        this.allReadRoles = [...readRoles, ...readWriteRoles];
    }

    getAccessCondition(authContext: AuthContext, operation: AccessOperation): QueryNode {
        let roles: ReadonlyArray<string> = [];
        switch (operation) {
            case AccessOperation.READ:
                roles = this.allReadRoles;
                break;
            // @roles can't distinguish between create/update/delete
            case AccessOperation.CREATE:
            case AccessOperation.UPDATE:
            case AccessOperation.DELETE:
                roles = this.readWriteRoles;
        }
        const allowed = roles.some((allowedRole) =>
            (authContext.authRoles ?? []).includes(allowedRole),
        );
        return new ConstBoolQueryNode(allowed);
    }
}

export class ProfileBasedPermissionDescriptor extends PermissionDescriptor {
    private readonly accessGroupField: Field | undefined;

    constructor(
        private readonly profile: PermissionProfile,
        private readonly rootEntityType?: RootEntityType,
    ) {
        super();
        this.accessGroupField = rootEntityType && rootEntityType.getField(ACCESS_GROUP_FIELD);
    }

    getAccessCondition(
        authContext: AuthContext,
        operation: AccessOperation,
        instanceNode: QueryNode,
    ): QueryNode {
        return this.getAccessConditionForPermissions(
            this.getApplicablePermissions(authContext, operation),
            authContext,
            instanceNode,
        );
    }

    private getAccessConditionForPermissions(
        applicablePermissions: ReadonlyArray<Permission>,
        authContext: AuthContext,
        instanceNode: QueryNode,
    ): QueryNode {
        if (!applicablePermissions.length) {
            return ConstBoolQueryNode.FALSE;
        }

        // simplified run for permissions that only restrict by access group, can generate one IN clause
        const pureAccessGroupCondition = this.getPureAccessGroupCondition(
            applicablePermissions.filter((p) => !p.restrictions.length),
            authContext,
            instanceNode,
        );

        const complexCondition = applicablePermissions
            .filter((p) => p.restrictions.length)
            .map((p) => this.getPermissionRestrictionCondition(p, authContext, instanceNode))
            .reduce(
                (acc, node) => new BinaryOperationQueryNode(acc, BinaryOperator.OR, node),
                ConstBoolQueryNode.FALSE,
            );

        // we either need to match a permission with purely an access group, or one of the others
        const combined = new BinaryOperationQueryNode(
            pureAccessGroupCondition,
            BinaryOperator.OR,
            complexCondition,
        );
        return simplifyBooleans(combined);
    }

    getPermissionRestrictionCondition(
        permission: Permission,
        authContext: AuthContext,
        instanceNode: QueryNode,
    ): QueryNode {
        let accessGroupConditionNode: QueryNode;
        if (permission.restrictToAccessGroups) {
            const allowedAccessGroups = permission.getAllowedAccessGroups(authContext);
            accessGroupConditionNode = this.getAccessGroupConditionNode(
                allowedAccessGroups,
                instanceNode,
            );
        } else {
            accessGroupConditionNode = ConstBoolQueryNode.TRUE;
        }

        const restrictionNodes = permission.restrictions.map((restriction) => {
            const fieldPath = this.getRestrictionFieldPath(restriction.field);
            const fieldNode = createFieldPathNode(fieldPath, instanceNode);
            // for list fields, it's enough if one of the list items matches
            const isList = !!fieldPath.lastField?.isList;

            if (restriction.value !== undefined) {
                return new BinaryOperationQueryNode(
                    fieldNode,
                    isList ? BinaryOperator.ANY_IN : BinaryOperator.EQUAL,
                    new LiteralQueryNode(isList ? [restriction.value] : restriction.value),
                );
            }

            if (restriction.valueTemplate !== undefined) {
                const values = permission.evaluateTemplate(restriction.valueTemplate, authContext);
                return new BinaryOperationQueryNode(
                    fieldNode,
                    isList ? BinaryOperator.ANY_IN : BinaryOperator.IN,
                    new LiteralQueryNode(values),
                );
            }

            if (restriction.claim !== undefined) {
                const claimValue = authContext.claims?.[restriction.claim];
                const claimValues = isReadonlyArray(claimValue) ? claimValue : [claimValue];
                const sanitizedClaimValues = claimValues.filter(
                    (v) => !!v && typeof v === 'string',
                );
                if (!sanitizedClaimValues.length) {
                    return ConstBoolQueryNode.FALSE;
                }
                return new BinaryOperationQueryNode(
                    fieldNode,
                    isList ? BinaryOperator.ANY_IN : BinaryOperator.IN,
                    new LiteralQueryNode(sanitizedClaimValues),
                );
            }

            throw new Error(`Invalid permission restriction (field: ${restriction.field})`);
        });

        return restrictionNodes.reduce(
            (acc: QueryNode, node) => new BinaryOperationQueryNode(acc, BinaryOperator.AND, node),
            accessGroupConditionNode,
        );
    }

    getListChangeCondition(
        authContext: AuthContext,
        operation: AccessOperation,
        oldInstanceNode: QueryNode | undefined,
        newInstanceNode: QueryNode,
        isFieldPathAffected?: (fields: ReadonlyArray<Field>) => boolean,
    ): QueryNode {
        const applicablePermissions = this.getApplicablePermissions(authContext, operation);
        const fieldPathsByPath = new Map<string, FieldPath>();
        for (const permission of applicablePermissions) {
            for (const restriction of permission.restrictions) {
                const fieldPath = this.getRestrictionFieldPath(restriction.field);
                if (
                    fieldPath.lastField?.isList &&
                    fieldPath.fields &&
                    (!isFieldPathAffected || isFieldPathAffected(fieldPath.fields))
                ) {
                    fieldPathsByPath.set(fieldPath.path, fieldPath);
                }
            }
        }

        const conditions: QueryNode[] = [];
        for (const fieldPath of fieldPathsByPath.values()) {
            const fields = fieldPath.fields!;
            const newListNode = createFieldPathNode(fieldPath, newInstanceNode);
            const oldListNode = oldInstanceNode
                ? createFieldPathNode(fieldPath, oldInstanceNode)
                : ListQueryNode.EMPTY;
            const addedItemsNode = new BinaryOperationQueryNode(
                newListNode,
                BinaryOperator.SUBTRACT_LISTS,
                oldListNode,
            );
            const removedItemsNode = new BinaryOperationQueryNode(
                oldListNode,
                BinaryOperator.SUBTRACT_LISTS,
                newListNode,
            );
            const itemConditions = [addedItemsNode, removedItemsNode].map((changedItemsNode) => {
                // check whether the user could access the new instance if the list only consisted of this item
                // (also checking removed items against the new instance so the other fields are up-to-date)
                const itemVariable = new VariableQueryNode('item');
                return new QuantifierFilterNode({
                    listNode: changedItemsNode,
                    itemVariable,
                    quantifier: 'every',
                    conditionNode: this.getAccessCondition(
                        authContext,
                        operation,
                        replaceFieldPathValue(
                            newInstanceNode,
                            fields,
                            new ListQueryNode([itemVariable]),
                        ),
                    ),
                });
            });

            // permissions that don't restrict this field allow all changes to it. Checking them first is cheaper
            // than checking each item, and the item checks are skipped if they already grant access.
            const permissionsWithoutRestrictionOnField = applicablePermissions.filter(
                (permission) =>
                    !permission.restrictions.some(
                        (restriction) => restriction.field === fieldPath.path,
                    ),
            );
            const unrestrictedCondition = this.getAccessConditionForPermissions(
                permissionsWithoutRestrictionOnField,
                authContext,
                newInstanceNode,
            );
            conditions.push(
                new BinaryOperationQueryNode(
                    unrestrictedCondition,
                    BinaryOperator.OR,
                    new BinaryOperationQueryNode(
                        itemConditions[0],
                        BinaryOperator.AND,
                        itemConditions[1],
                    ),
                ),
            );
        }

        return simplifyBooleans(
            conditions.reduce(
                (acc: QueryNode, node) =>
                    new BinaryOperationQueryNode(acc, BinaryOperator.AND, node),
                ConstBoolQueryNode.TRUE,
            ),
        );
    }

    private isListRestrictionField(path: string): boolean {
        return !!this.rootEntityType && !!this.getRestrictionFieldPath(path).lastField?.isList;
    }

    private getRestrictionFieldPath(path: string): FieldPath {
        if (!this.rootEntityType) {
            throw new Error(
                `Permission profiles with restrictions can only be used on root entities`,
            );
        }
        return new FieldPath({
            path,
            baseType: this.rootEntityType,
            canTraverseRootEntities: false,
            canUseCollectFields: false,
        });
    }

    private getPureAccessGroupCondition(
        applicablePermissions: ReadonlyArray<Permission>,
        authContext: AuthContext,
        instanceNode: QueryNode,
    ): QueryNode {
        if (!applicablePermissions.length) {
            return ConstBoolQueryNode.FALSE;
        }

        if (applicablePermissions.some((permission) => !permission.restrictToAccessGroups)) {
            return ConstBoolQueryNode.TRUE;
        }
        if (applicablePermissions.some((p) => p.restrictions.length)) {
            throw new Error(`Did not expect permissions with restrictions`);
        }

        const allowedAccessGroups = this.getAllowedAccessGroups(applicablePermissions, authContext);
        return this.getAccessGroupConditionNode(allowedAccessGroups, instanceNode);
    }

    private getAccessGroupConditionNode(
        allowedAccessGroups: ReadonlyArray<string>,
        instanceNode: QueryNode,
    ) {
        if (!this.accessGroupField) {
            if (this.rootEntityType) {
                throw new Error(
                    `Using accessGroup-restricted permission profile on type ${this.rootEntityType.name} which does not have an accessGroup field`,
                );
            } else {
                throw new Error(
                    `accessGroup-restricted permission profiles can only be used on root entities`,
                );
            }
        }

        const accessGroupNode = new FieldQueryNode(instanceNode, this.accessGroupField);
        return new BinaryOperationQueryNode(
            accessGroupNode,
            BinaryOperator.IN,
            new LiteralQueryNode(allowedAccessGroups),
        );
    }

    private getApplicablePermissions(
        authContext: AuthContext,
        operation: AccessOperation,
    ): ReadonlyArray<Permission> {
        return this.profile.permissions.filter(
            (permission) =>
                permission.allowsOperation(operation) &&
                permission.appliesToAuthContext(authContext),
        );
    }

    private getAllowedAccessGroups(
        applicablePermissions: ReadonlyArray<Permission>,
        authContext: AuthContext,
    ) {
        return applicablePermissions.flatMap(
            (permission) => permission.getAllowedAccessGroups(authContext)!,
        );
    }

    getExplanationForCondition(
        authContext: AuthContext,
        operation: AccessOperation,
        context: ConditionExplanationContext,
    ): string | undefined {
        const applicablePermissions = this.getApplicablePermissions(authContext, operation);

        if (!applicablePermissions.length) {
            return this.getGeneralExplanation(context);
        }

        // if we only restrict by access group, we can provide a more detailed explanation
        if (
            applicablePermissions.every((p) => p.restrictToAccessGroups && !p.restrictions.length)
        ) {
            const allowedAccessGroups = this.getAllowedAccessGroups(
                applicablePermissions,
                authContext,
            );
            const prefix = this.getExplanationPrefixForAccessGroups(context);
            return `${prefix}${allowedAccessGroups.join(', ')})`;
        }

        // if we only restrict by a single field, that's also ok
        if (applicablePermissions.every((permission) => !permission.restrictToAccessGroups)) {
            const restrictedFields = new Set<string>();
            for (const permission of applicablePermissions) {
                for (const restriction of permission.restrictions) {
                    restrictedFields.add(restriction.field);
                }
            }
            if (restrictedFields.size == 1) {
                return this.getExplanationForSingleField(context, [...restrictedFields][0]);
            }
        }

        return this.getGenericDataDependentExplanation(context);
    }

    getExplanationPrefixForAccessGroups(context: ConditionExplanationContext): string {
        const accessGroupFieldName = this.accessGroupField
            ? this.accessGroupField.name
            : this.accessGroupField;
        const typeName = (this.rootEntityType && this.rootEntityType.name) || '';
        switch (context) {
            case ConditionExplanationContext.BEFORE_WRITE:
                return `${typeName} objects with this access group (allowed access groups: `;
            case ConditionExplanationContext.SET:
                return `set ${typeName}.${accessGroupFieldName} to this value (allowed values: `;
        }
    }

    getExplanationForSingleField(context: ConditionExplanationContext, fieldName: string): string {
        const typeName = (this.rootEntityType && this.rootEntityType.name) || '';
        switch (context) {
            case ConditionExplanationContext.BEFORE_WRITE:
                return `this ${typeName} object`;
            case ConditionExplanationContext.SET:
                if (this.isListRestrictionField(fieldName)) {
                    return `set ${typeName}.${fieldName} to these values (each added or removed value needs to be allowed on its own, and the resulting object needs to be accessible)`;
                }
                return `set ${typeName}.${fieldName} to this value`;
        }
    }

    getGeneralExplanation(context: ConditionExplanationContext): string {
        const typeName = (this.rootEntityType && this.rootEntityType.name) || '';
        switch (context) {
            case ConditionExplanationContext.BEFORE_WRITE:
                return `${typeName} objects`;
            case ConditionExplanationContext.SET:
                return `update ${typeName} objects`;
        }
    }

    getGenericDataDependentExplanation(context: ConditionExplanationContext): string {
        const typeName = (this.rootEntityType && this.rootEntityType.name) || '';
        switch (context) {
            case ConditionExplanationContext.BEFORE_WRITE:
                return `this ${typeName} object`;
            case ConditionExplanationContext.SET:
                return `set these values in ${typeName} objects`;
        }
    }
}

/**
 * Creates a copy of objectNode where the value at the given field path is replaced by valueNode
 */
function replaceFieldPathValue(
    objectNode: QueryNode,
    fields: ReadonlyArray<Field>,
    valueNode: QueryNode,
): QueryNode {
    const [field, ...remainingFields] = fields;
    let fieldValueNode = valueNode;
    if (remainingFields.length) {
        // nested objects (value objects or entity extensions) might be null
        const nestedObjectNode = new FieldQueryNode(objectNode, field);
        fieldValueNode = replaceFieldPathValue(
            new ConditionalQueryNode(
                new TypeCheckQueryNode(nestedObjectNode, BasicType.OBJECT),
                nestedObjectNode,
                ObjectQueryNode.EMPTY,
            ),
            remainingFields,
            valueNode,
        );
    }
    return new MergeObjectsQueryNode([
        objectNode,
        new ObjectQueryNode([new PropertySpecification(field.name, fieldValueNode)]),
    ]);
}
