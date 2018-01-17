export enum AccessOperation { READ, WRITE }

export interface AuthContext {
    authRoles: string[]
}

export const AUTHORIZATION_ERROR_NAME = 'AuthorizationError';