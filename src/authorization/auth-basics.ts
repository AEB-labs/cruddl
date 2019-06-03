export enum AccessOperation { READ, WRITE }

export interface AuthContext {
    readonly authRoles: ReadonlyArray<string>
}
