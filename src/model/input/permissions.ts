import { ASTNode } from 'graphql';

export interface PermissionsInput {
    readonly astNode?: ASTNode
    readonly permissionProfileName?: string
    readonly roles?: RolesSpecifier
}

export interface RolesSpecifier {
    readonly read: ReadonlyArray<string>
    readonly readWrite: ReadonlyArray<string>
}
