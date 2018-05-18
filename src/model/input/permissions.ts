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
