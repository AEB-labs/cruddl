import { ASTNode } from 'graphql';
import { MessageLocation } from '../validation';

export interface PermissionsConfig {
    readonly permissionProfileNameAstNode?: ASTNode;
    readonly permissionProfileName?: string;
    readonly roles?: RolesSpecifierConfig;
}

export interface RolesSpecifierConfig {
    readonly astNode?: ASTNode;
    readonly read?: ReadonlyArray<string>;
    readonly readWrite?: ReadonlyArray<string>;
}

export interface NamespacedPermissionProfileConfigMap {
    readonly namespacePath?: ReadonlyArray<string>;
    readonly profiles: PermissionProfileConfigMap;
}

export type PermissionAccessKind = 'read' | 'readWrite' | 'create' | 'update' | 'delete';

export interface PermissionProfileConfig {
    readonly permissions?: ReadonlyArray<PermissionConfig>;
    readonly loc?: MessageLocation;
}

export type PermissionProfileConfigMap = { [name: string]: PermissionProfileConfig };

export interface PermissionConfig {
    /**
     * Roles this permission is granted to. May use wildcards
     */
    readonly roles: ReadonlyArray<string>;

    readonly access: PermissionAccessKind | ReadonlyArray<PermissionAccessKind>;

    /**
     * If specified, the permission is only granted for objects with certain access groups
     */
    readonly restrictToAccessGroups?: ReadonlyArray<string>;

    readonly restrictions?: ReadonlyArray<PermissionRestrictionConfig>;

    readonly loc?: MessageLocation;
}

export interface PermissionRestrictionConfig {
    /**
     * Dot-separated field path
     */
    readonly field: string;

    /**
     * Literal value that must match exactly
     */
    readonly value?: unknown;

    /**
     * A string that can use capture groups of the role regex
     */
    readonly valueTemplate?: string;

    /**
     * The name of a custom claim on the user's token that needs to match exactly or which needs to be an array where
     * one item matches the field exactly
     */
    readonly claim?: string;

    readonly loc?: MessageLocation;
    readonly fieldValueLoc?: MessageLocation;
}
