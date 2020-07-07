export enum AccessOperation {
    READ = 'READ',
    CREATE = 'CREATE',
    UPDATE = 'UPDATE',
    DELETE = 'DELETE'
}

export interface AuthContext {
    readonly authRoles: ReadonlyArray<string>;
}
