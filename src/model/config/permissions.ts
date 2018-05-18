import { ASTNode } from 'graphql';

export interface PermissionsConfig {
    readonly permissionProfileNameAstNode?: ASTNode
    readonly permissionProfileName?: string
    readonly roles?: RolesSpecifierConfig
}

export interface RolesSpecifierConfig {
    readonly astNode?: ASTNode
    readonly read?: ReadonlyArray<string>
    readonly readWrite?: ReadonlyArray<string>
}

export type PermissionProfileConfigMap = { readonly [name: string]: { permissions: ReadonlyArray<PermissionConfig> } }

export type PermissionAccessKind = "read"|"readWrite";

export interface PermissionProfileConfig {
    readonly permissions: ReadonlyArray<PermissionConfig>
}

export interface PermissionConfig {
    /**
     * Roles this permission is granted to. May use wildcards
     */
    roles: string[]

    access: PermissionAccessKind

    /**
     * If specified, the permission is only granted for objects with certain access groups
     */
    restrictToAccessGroups?: string[]
}
