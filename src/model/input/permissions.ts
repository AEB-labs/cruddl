import { ASTNode } from 'graphql';

export interface PermissionsInput {
    readonly permissionProfileNameAstNode?: ASTNode
    readonly permissionProfileName?: string
    readonly roles?: RolesSpecifierInput
    readonly rolesASTNode?: ASTNode
}

export interface RolesSpecifierInput {
    readonly read?: ReadonlyArray<string>
    readonly readWrite?: ReadonlyArray<string>
}
