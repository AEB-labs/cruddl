export enum AccessOperation { READ, WRITE }

export interface AuthContext {
    readonly authRoles: ReadonlyArray<string>
}

export const AUTHORIZATION_ERROR_NAME = 'AuthorizationError';