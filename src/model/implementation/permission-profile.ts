import { AccessOperation, AuthContext } from '../../authorization/auth-basics';
import { WILDCARD_CHARACTER } from '../../schema/constants';
import { escapeRegExp } from '../../utils/utils';
import { MessageLocation, PermissionAccessKind, PermissionConfig, PermissionProfileConfig } from '../index';

export class PermissionProfile {
    readonly permissions: ReadonlyArray<Permission>;
    readonly loc: MessageLocation | undefined;

    constructor(
        public readonly name: string,
        public readonly namespacePath: ReadonlyArray<string>,
        config: PermissionProfileConfig
    ) {
        this.permissions = (config.permissions || []).map(permissionConfig => new Permission(permissionConfig));
        this.loc = config.loc;
    }
}

export class Permission {
    public readonly roles: RoleSpecifier;

    public readonly access: PermissionAccessKind;

    public readonly restrictToAccessGroups?: ReadonlyArray<string>;

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
                return this.access == 'read' || this.access == 'readWrite';
            case AccessOperation.WRITE:
                return this.access == 'readWrite';
            default:
                return false;
        }
    }
}

export class RoleSpecifier {
    private readonly literalRoles = new Set<string>();
    private readonly regexp: RegExp | undefined;

    constructor(roles: ReadonlyArray<string>) {
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
