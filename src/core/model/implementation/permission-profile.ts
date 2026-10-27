import type { AuthContext } from '../../authorization/auth-basics.js';
import { AccessOperation } from '../../authorization/auth-basics.js';
import { WILDCARD_CHARACTER } from '../../schema/constants.js';
import { escapeRegExp, isReadonlyArray } from '../../utils/utils.js';
import type {
    PermissionAccessKind,
    PermissionConfig,
    PermissionProfileConfig,
    PermissionRestrictionConfig,
} from '../config/permissions.js';
import type { MessageLocation } from '../validation/location.js';
import { ValidationMessage } from '../validation/message.js';
import type { ModelComponent, ValidationContext } from '../validation/validation-context.js';

export class PermissionProfile implements ModelComponent {
    readonly permissions: ReadonlyArray<Permission>;
    readonly loc: MessageLocation | undefined;

    constructor(
        public readonly name: string,
        public readonly namespacePath: ReadonlyArray<string>,
        config: PermissionProfileConfig,
    ) {
        this.permissions = (config.permissions || []).map(
            (permissionConfig) => new Permission(permissionConfig),
        );
        this.loc = config.loc;
    }

    validate(context: ValidationContext) {
        if (!this.permissions.length) {
            context.addMessage(
                ValidationMessage.nonSuppressableWarning(
                    `Permission profile "${this.name}" does not define any permissions, so access is denied for everyone.`,
                    this.loc,
                ),
            );
        }
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
    readonly loc: MessageLocation | undefined;
    readonly restrictToAccessGroupsLocs: ReadonlyArray<MessageLocation | undefined> | undefined;

    constructor(config: PermissionConfig) {
        this.roles = new RoleSpecifier(config.roles);
        this.access = isReadonlyArray(config.access) ? config.access : [config.access];
        this.restrictToAccessGroups = config.restrictToAccessGroups;
        this.hasDynamicAccessGroups =
            !!this.restrictToAccessGroups &&
            this.restrictToAccessGroups.some((group) => group.includes('$'));
        this.restrictions = config.restrictions
            ? config.restrictions.map((c) => new PermissionRestriction(c))
            : [];
        this.loc = config.loc;
        this.restrictToAccessGroupsLocs = config.restrictToAccessGroupsLocs;
    }

    appliesToAuthContext(authContext: AuthContext) {
        return (
            authContext.authRoles &&
            authContext.authRoles.some((role) => this.roles.includesRole(role))
        );
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
            const accessGroupsInExpression = this.evaluateTemplate(
                accessGroupExpression,
                authContext,
            );
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
            for (const role of authContext.authRoles ?? []) {
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

    /**
     * The number of capturing groups that can be referenced with placeholders like $1
     */
    readonly capturingGroupCount: number;
}

/**
 * Regular expression flags that do not have an effect on role specifiers (and would make matching stateful)
 */
const IGNORED_REGEX_FLAGS = /[gy]/g;

export class RegexRoleSpecifierEntry implements RoleSpecifierEntry {
    readonly mayHaveCapturingGroups: boolean;
    readonly capturingGroupCount: number;

    /**
     * The flags of the expression that are ignored (g and y)
     */
    readonly ignoredFlags: string;

    /**
     * If the expression does not need to match the whole role, a description of the unmatched part and suggested
     * expressions that make this explicit
     *
     * An expression matches the whole role if it starts with ^ (or .*) and ends with $ (or .*).
     */
    readonly anchoringProblem:
        | {
              readonly unmatchedPart: 'beginning' | 'end' | 'beginning and end';
              readonly wholeRoleSuggestion: string;
              readonly trailingCharactersSuggestion: string | undefined;
          }
        | undefined;

    private readonly regexp: RegExp;

    constructor(expression: string) {
        const parts = /^\/(.*)\/([^\/]*)$/.exec(expression);
        if (!parts) {
            throw new InvalidRoleSpecifierError(
                `Role specifier starts with a slash (/), but is not a valid regular expression: ${expression}`,
            );
        }
        const source = parts[1] || '';
        const flags = parts[2] || '';
        const isStartAnchored = source.startsWith('^') || source.startsWith('.*');
        const isEndAnchored =
            (source.endsWith('$') && !source.endsWith('\\$')) ||
            (source.endsWith('.*') && !source.endsWith('\\.*'));
        if (isStartAnchored && isEndAnchored) {
            this.anchoringProblem = undefined;
        } else {
            const startAnchoredSource = isStartAnchored ? source : '^' + source;
            this.anchoringProblem = {
                unmatchedPart: !isStartAnchored
                    ? !isEndAnchored
                        ? 'beginning and end'
                        : 'beginning'
                    : 'end',
                wholeRoleSuggestion: `/${startAnchoredSource}${isEndAnchored ? '' : '$'}/${flags}`,
                trailingCharactersSuggestion: isEndAnchored
                    ? undefined
                    : `/${startAnchoredSource}.*/${flags}`,
            };
        }
        this.ignoredFlags = (flags.match(IGNORED_REGEX_FLAGS) ?? []).join('');
        try {
            this.regexp = new RegExp(parts[1] || '', flags.replace(IGNORED_REGEX_FLAGS, ''));
        } catch (e) {
            if (e instanceof SyntaxError) {
                throw new InvalidRoleSpecifierError(e.message);
            }
            throw e;
        }

        // it's hard to reliably check this, but this at least offers some santiy check
        this.mayHaveCapturingGroups = this.regexp.source.includes('(');
        // an alternative that matches the empty string results in one array item per capturing group
        this.capturingGroupCount = new RegExp(this.regexp.source + '|').exec('')!.length - 1;
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
    readonly capturingGroupCount = 0;
    private readonly regexp: RegExp;

    constructor(pattern: string) {
        // it's hard to reliably check this, but this at least offers some santiy check
        this.regexp = new RegExp('^' + escapeRegExp(pattern).replaceAll('\\*', '.*') + '$');
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
    readonly capturingGroupCount = 0;

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
    readonly claim?: string;
    readonly loc?: MessageLocation;
    readonly fieldValueLoc?: MessageLocation;
    readonly valueLoc?: MessageLocation;

    constructor(config: PermissionRestrictionConfig) {
        this.field = config.field;
        this.value = config.value;
        this.valueTemplate = config.valueTemplate;
        this.claim = config.claim;
        this.loc = config.loc;
        this.fieldValueLoc = config.fieldValueLoc;
        this.valueLoc = config.valueLoc;
    }

    validate(context: ValidationContext) {
        const number = [this.valueTemplate, this.value, this.claim].filter(
            (v) => v !== undefined,
        ).length;
        if (number !== 1) {
            context.addMessage(
                ValidationMessage.error(
                    `Exactly one of "value", "valueTemplate", and "claim" must be specified.`,
                    this.loc,
                ),
            );
        }
    }
}
