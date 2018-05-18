import { ASTNode } from 'graphql';

export interface PermissionsInput {
    readonly permissionProfileNameAstNode?: ASTNode
    readonly permissionProfileName?: string
    readonly roles?: RolesSpecifierInput
}

export interface RolesSpecifierInput {
    readonly astNode?: ASTNode
    readonly read?: ReadonlyArray<string>
    readonly readWrite?: ReadonlyArray<string>
}
