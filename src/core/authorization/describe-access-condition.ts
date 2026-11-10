import type { RootEntityType } from '../model/implementation/root-entity-type.js';
import type { MessageLocation } from '../model/validation/location.js';
import type { AccessOperation, AuthContext } from './auth-basics.js';
import { getPermissionDescriptorOfRootEntityType } from './permission-descriptors-in-model.js';

/**
 * Describes which objects of a root entity type a user can access
 */
export type AccessConditionDescription =
    /**
     * All objects can be accessed
     */
    | { readonly kind: 'granted' }
    /**
     * No object can be accessed
     */
    | {
          readonly kind: 'denied';

          /**
           * Set if access is controlled by a permission profile
           */
          readonly permissionProfileName?: string;

          /**
           * The permissions of the permission profile that apply to the user and operation. Set
           * if access is controlled by a permission profile. If it is not empty, each of them
           * has empty accessGroups or a restriction without values.
           */
          readonly permissions?: ReadonlyArray<PermissionDescription>;
      }
    /**
     * Objects can be accessed if they match at least one of the permissions. Queries filter
     * out the other objects.
     */
    | {
          readonly kind: 'restricted';
          readonly permissionProfileName: string;

          /**
           * The permissions of the permission profile that apply to the user and operation
           */
          readonly permissions: ReadonlyArray<PermissionDescription>;
      };

/**
 * A permission that applies to a user. An object matches it if it matches the access groups (if
 * any) and all restrictions.
 */
export interface PermissionDescription {
    /**
     * The access groups the user can access via this permission, after evaluating placeholders.
     * They are compared with the accessGroup field. Not set if the permission is not restricted to
     * access groups.
     */
    readonly accessGroups?: ReadonlyArray<string>;

    readonly restrictions: ReadonlyArray<RestrictionDescription>;

    /**
     * The location of the permission in the permission profile source
     */
    readonly loc?: MessageLocation;
}

/**
 * A restriction of a permission: the value of a field needs to be one of the given values. For
 * list fields, one of the items needs to be one of the given values.
 */
export type RestrictionDescription = {
    /**
     * The names of the model fields from the root entity type to the restricted field
     */
    readonly fieldPath: ReadonlyArray<string>;

    /**
     * The allowed values. If this is empty, no object matches the restriction.
     */
    readonly values: ReadonlyArray<unknown>;

    /**
     * The location of the restriction in the permission profile source
     */
    readonly loc?: MessageLocation;
} & (
    | { readonly source: 'value' | 'valueTemplate' }
    | {
          readonly source: 'claim';

          /**
           * The name of the claim the values are taken from
           */
          readonly claim: string;
      }
);

/**
 * Describes which objects of a root entity type a user can access
 *
 * This is the condition that cruddl applies when it reads or modifies objects of the type. It
 * allows tools to explain the effects of permission profiles, e.g. which filters a query contains
 * because of authorization.
 *
 * @param rootEntityType the type to describe the access condition of
 * @param authContext the roles and claims of the user
 * @param operation the kind of access (defaults to READ)
 */
export function describeAccessCondition(
    rootEntityType: RootEntityType,
    authContext: AuthContext,
    operation: `${AccessOperation}` = 'READ',
): AccessConditionDescription {
    return getPermissionDescriptorOfRootEntityType(rootEntityType).describeAccessCondition(
        authContext,
        operation as AccessOperation,
    );
}
