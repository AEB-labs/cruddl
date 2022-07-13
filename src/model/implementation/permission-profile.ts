import { emit } from 'cluster';
import { AccessOperation, AuthContext } from '../../authorization/auth-basics';
import { WILDCARD_CHARACTER } from '../../schema/constants';
import { escapeRegExp } from '../../utils/utils';
import {
    MessageLocation,
    PermissionAccessKind,
    PermissionConfig,
    PermissionProfileConfig,
    PermissionRestrictionConfig,
    ValidationMessage,
} from '../index';
import { ModelComponent, ValidationContext } from '../validation/validation-context';

export class PermissionProfile implements ModelComponent {
    readonly permissions: ReadonlyArray<Permission>;
    readonly loc: MessageLocation | undefined;

    constructor(
        public readonly name: string,
        public readonly namespacePath: ReadonlyArray<string>,
        config: PermissionProfileConfig
    ) {
        this.permissions = (config.permissions || []).map((permissionConfig) => new Permission(permissionConfig));
        this.loc = config.loc;
    }

    validate(context: ValidationContext) {
        for (const permission of this.permissions) {
            permission.validate(context);
        }
    }
}

export class Permission implements ModelComponent {
    readonly roles: RoleSpecifier;
    readonly access: ReadonlyArray<PermissionAccessKind>;
    readonly restrictToAccessGroups?: ReadonlyArray<string>;
    readonly hasDynamicAccessGroups: boolean;
    readonly restrictions: ReadonlyArray<PermissionRestriction>;

    constructor(config: PermissionConfig) {
        this.roles = new RoleSpecifier(config.roles);
        this.access = Array.isArray(config.access) ? config.access : [config.access];
        this.restrictToAccessGroups = config.restrictToAccessGroups;
        this.hasDynamicAccessGroups =
            !!this.restrictToAccessGroups && this.restrictToAccessGroups.some((group) => group.includes('$'));
        this.restrictions = config.restrictions ? config.restrictions.map((c) => new PermissionRestriction(c)) : [];
    }

    appliesToAuthContext(authContext: AuthContext) {
        return authContext.authRoles.some((role) => this.roles.includesRole(role));
    }

    allowsOperation(operation: AccessOperation) {
        switch (operation) {
            case AccessOperation.READ:
                return this.access.includes('read') || this.access.includes('readWrite');
            case AccessOperation.CREATE:
                return this.access.includes('readWrite') || this.access.includes('create');
            case AccessOperation.UPDATE:
                return this.access.includes('readWrite') || this.access.includes('update');
            case AccessOperation.DELETE:
                return this.access.includes('readWrite') || this.access.includes('delete');
            default:
                return false;
        }
    }

    getAllowedAccessGroups(authContext: AuthContext): ReadonlyArray<string> {
        if (!this.restrictToAccessGroups) {
            return [];
        }

        if (!this.appliesToAuthContext(authContext)) {
            return [];
        }

        const accessGroups = new Set<string>();
        for (const accessGroupExpression of this.restrictToAccessGroups) {
            const accessGroupsInExpression = this.evaluateTemplate(accessGroupExpression, authContext);
            for (const accessGroup of accessGroupsInExpression) {
                accessGroups.add(accessGroup);
            }
        }
        return Array.from(accessGroups);
    }

    /**
     * Replaces placeholders like $1 with the capture groups of the roles regex
     */
    evaluateTemplate(template: string, authContext: AuthContext): ReadonlyArray<string> {
        if (!template.includes('$')) {
            return [template];
        }
        const values = new Set<string>();
        for (const specifier of this.roles.entries) {
            for (const role of authContext.authRoles) {
                const value = specifier.getReplacementForRole(role, template);
                if (value !== undefined) {
                    values.add(value);
                }
            }
        }
        return Array.from(values);
    }

    validate(context: ValidationContext) {
        for (const restriction of this.restrictions) {
            restriction.validate(context);
        }
    }
}

export class RoleSpecifier {
    readonly entries: ReadonlyArray<RoleSpecifierEntry>;

    constructor(roles: ReadonlyArray<string>) {
        this.entries = roles.map((specifier) => createRoleSpecifierEntry(specifier));
    }

    includesRole(role: string): boolean {
        return this.entries.some((e) => e.matchesRole(role));
    }
}

export function createRoleSpecifierEntry(specifier: string) {
    if (specifier.startsWith('/')) {
        return new RegexRoleSpecifierEntry(specifier);
    }
    if (specifier.includes(WILDCARD_CHARACTER)) {
        return new WildcardRoleSpecifierEntry(specifier);
    }
    return new LiteralRoleSpecifierEntry(specifier);
}

export class InvalidRoleSpecifierError extends Error {
    constructor(message: string) {
        super(message);
        this.name = this.constructor.name;
    }
}

export interface RoleSpecifierEntry {
    matchesRole(role: string): boolean;

    getReplacementForRole(role: string, replacementExpression: string): string | undefined;

    readonly mayHaveCapturingGroups: boolean;
}

export class RegexRoleSpecifierEntry implements RoleSpecifierEntry {
    readonly mayHaveCapturingGroups: boolean;
    private readonly regexp: RegExp;

    constructor(expression: string) {
        const parts = /^\/(.*)\/([^\/]*)$/.exec(expression);
        if (!parts) {
            throw new InvalidRoleSpecifierError(
                `Role specifier starts with a slash (/), but is not a valid regular expression: ${expression}`
            );
        }
        try {
            this.regexp = new RegExp(parts[1] || '', parts[2] || '');
        } catch (e) {
            if (e instanceof SyntaxError) {
                throw new InvalidRoleSpecifierError(e.message);
            }
            throw e;
        }

        // it's hard to reliably check this, but this at least offers some santiy check
        this.mayHaveCapturingGroups = this.regexp.source.includes('(');
    }

    matchesRole(role: string): boolean {
        return this.regexp.test(role);
    }

    getReplacementForRole(role: string, replacementExpression: string): string | undefined {
        if (!this.mayHaveCapturingGroups) {
            return undefined;
        }
        if (!this.matchesRole(role)) {
            return undefined;
        }
        return role.replace(this.regexp, replacementExpression);
    }
}

export class WildcardRoleSpecifierEntry implements RoleSpecifierEntry {
    readonly mayHaveCapturingGroups = false;
    private readonly regexp: RegExp;

    constructor(pattern: string) {
        // it's hard to reliably check this, but this at least offers some santiy check
        this.regexp = new RegExp('^' + escapeRegExp(pattern).replace('\\*', '.*') + '$');
    }

    matchesRole(role: string): boolean {
        return this.regexp.test(role);
    }

    getReplacementForRole(role: string, replacementExpression: string): string | undefined {
        return undefined;
    }
}

export class LiteralRoleSpecifierEntry implements RoleSpecifierEntry {
    readonly mayHaveCapturingGroups = false;

    constructor(private readonly role: string) {}

    matchesRole(role: string): boolean {
        return role === this.role;
    }

    getReplacementForRole(role: string, replacementExpression: string): string | undefined {
        return undefined;
    }
}

export class PermissionRestriction implements ModelComponent {
    readonly field: string;
    readonly value?: unknown;
    readonly valueTemplate?: string;
    readonly loc?: MessageLocation;
    readonly fieldValueLoc?: MessageLocation;

    constructor(config: PermissionRestrictionConfig) {
        this.field = config.field;
        this.value = config.value;
        this.valueTemplate = config.valueTemplate;
        this.loc = config.loc;
        this.fieldValueLoc = config.fieldValueLoc;
    }

    validate(context: ValidationContext) {
        if (this.valueTemplate !== undefined && this.value !== undefined) {
            context.addMessage(
                ValidationMessage.error(`"value" and "valueTemplate" cannot be both specified.`, this.loc)
            );
        }
    }
}
