export enum AccessOperation {
    READ = 'READ',
    CREATE = 'CREATE',
    UPDATE = 'UPDATE',
    DELETE = 'DELETE',
}

export interface AuthContext {
    /**
     * Role identifiers that apply to the user executing the query. Will be matched against roles in permission profiles.
     *
     * If undefined, defaults to empty array.
     */
    readonly authRoles?: ReadonlyArray<string>;

    /**
     * A map of custom claim values that can be used with permission restrictions
     *
     * Currently, only strings and string arrays are supported
     */
    readonly customClaims?: { readonly [claimNam: string]: string | ReadonlyArray<string> };
}
