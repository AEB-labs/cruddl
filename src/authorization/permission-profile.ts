import { WILDCARD_CHARACTER } from '../schema/schema-defaults';
import { escapeRegExp, mapValues } from '../utils/utils';
import { AccessOperation, AuthContext } from './auth-basics';

export type PermissionProfileMap = { [name: string]: PermissionProfile }

export type PermissionProfileConfigMap = { [name: string]: { permissions: PermissionConfig[] } }

export interface PermissionProfileConfig {
    permissions: PermissionConfig[]
}

export function createPermissionMap(map: PermissionProfileConfigMap = {}) {
    return mapValues(map, profile => new PermissionProfile(profile));
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

type PermissionAccessKind = "read"|"readWrite";

export class PermissionProfile {
    public readonly permissions: Permission[];

    constructor(config: PermissionProfileConfig) {
        this.permissions = config.permissions.map(permissionConfig => new Permission(permissionConfig));
    }
}

export class Permission {
    public readonly roles: RoleSpecifier;

    public readonly access: PermissionAccessKind;

    public readonly restrictToAccessGroups?: string[];

    constructor(config: PermissionConfig) {
        this.roles = new RoleSpecifier(config.roles);
        this.access = config.access;
        this.restrictToAccessGroups = config.restrictToAccessGroups;
    }

    appliesToAuthContext(authContext: AuthContext) {
        return authContext.authRoles.some(role => this.roles.includesRole(role));
    }

    allowsOperation(operation: AccessOperation) {
        switch (operation) {
            case AccessOperation.READ:
                return this.access == "read" || this.access == "readWrite";
            case AccessOperation.WRITE:
                return this.access == "readWrite";
            default:
                return false;
        }
    }
}

export class RoleSpecifier {
    private literalRoles = new Set<string>();
    private regexp: RegExp|undefined;

    constructor(roles: string[]) {
        const regexps = [];
        for (const role of roles) {
            if (role.includes(WILDCARD_CHARACTER)) {
                regexps.push('(^' + escapeRegExp(role).replace('\\*', '.*') + '$)');
            } else {
                this.literalRoles.add(role);
            }
        }
        this.regexp = regexps.length ? new RegExp(regexps.join('|')) : undefined;
    }

    includesRole(role: string): boolean {
        return this.literalRoles.has(role) || (!!this.regexp && this.regexp.test(role));
    }
}
