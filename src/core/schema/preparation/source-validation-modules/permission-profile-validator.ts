import { ChangeSet } from '../../../model/change-set/change-set.js';
import { createValueReplacementChange } from '../../../model/change-set/replace-value.js';
import type { RoleSpecifierEntry } from '../../../model/implementation/permission-profile.js';
import {
    createRoleSpecifierEntry,
    InvalidRoleSpecifierError,
    RegexRoleSpecifierEntry,
} from '../../../model/implementation/permission-profile.js';
import type { MessageLocation } from '../../../model/validation/location.js';
import { ValidationMessage } from '../../../model/validation/message.js';
import { QuickFix } from '../../../model/validation/quick-fix.js';
import { isReadonlyArray } from '../../../utils/utils.js';
import type { ParsedProjectSource, PathLocationMap } from '../../parsing/parsed-project.js';
import { ParsedProjectSourceBaseKind } from '../../parsing/parsed-project.js';
import type { ParsedSourceValidator } from '../ast-validator.js';

export class PermissionProfileValidator implements ParsedSourceValidator {
    validate(source: ParsedProjectSource): ReadonlyArray<ValidationMessage> {
        if (source.kind != ParsedProjectSourceBaseKind.OBJECT) {
            return [];
        }

        const data = source.object;

        if (
            !data ||
            !data.permissionProfiles ||
            isReadonlyArray(data.permissionProfiles) ||
            typeof data.permissionProfiles !== 'object'
        ) {
            return [];
        }

        return Object.entries(data.permissionProfiles as any).flatMap(([name, profile]) =>
            this.validatePermissionProfile({
                profile,
                name,
                pathLocationMap: source.pathLocationMap,
            }),
        );
    }

    private validatePermissionProfile({
        profile,
        name,
        pathLocationMap,
    }: {
        profile: any;
        name: string;
        pathLocationMap: PathLocationMap;
    }): ReadonlyArray<ValidationMessage> {
        if (!profile || !isReadonlyArray(profile.permissions)) {
            return [];
        }

        return Object.entries(profile.permissions).flatMap(([index, permission]) =>
            this.validatePermission({ permission, name, pathLocationMap, index }),
        );
    }

    private validatePermission({
        permission,
        name,
        index,
        pathLocationMap,
    }: {
        permission: any;
        name: string;
        index: string;
        pathLocationMap: PathLocationMap;
    }): ReadonlyArray<ValidationMessage> {
        if (!permission || !isReadonlyArray(permission.roles)) {
            return [];
        }

        const messages: ValidationMessage[] = [];
        const roleEntries: Array<{ role: string; entry: RoleSpecifierEntry }> = [];
        let roleIndex = 0;
        let hasRoleExpressionWithoutCaptureGroup = false;
        for (const role of permission.roles) {
            if (typeof role !== 'string') {
                continue;
            }
            const roleLocation =
                pathLocationMap[
                    `/permissionProfiles/${name}/permissions/${index}/roles/${roleIndex}`
                ];
            try {
                const entry = createRoleSpecifierEntry(role);
                roleEntries.push({ role, entry });
                if (!entry.mayHaveCapturingGroups) {
                    hasRoleExpressionWithoutCaptureGroup = true;
                }
                if (entry instanceof RegexRoleSpecifierEntry && entry.anchoringProblem) {
                    const { unmatchedPart, wholeRoleSuggestion, trailingCharactersSuggestion } =
                        entry.anchoringProblem;
                    messages.push(
                        ValidationMessage.nonSuppressableWarning(
                            `Regular expression role specifier "${role}" does not need to match the whole role, so it also matches roles with additional characters at the ${unmatchedPart}, and these characters are kept when placeholders like $1 are replaced. Use "${wholeRoleSuggestion}" to match the whole role` +
                                (trailingCharactersSuggestion
                                    ? `, or "${trailingCharactersSuggestion}" if additional characters at the end are intended.`
                                    : '.'),
                            roleLocation,
                            {
                                quickFixes: roleLocation
                                    ? [
                                          getRoleReplacementQuickFix(
                                              roleLocation,
                                              wholeRoleSuggestion,
                                              'Match the whole role',
                                              true,
                                          ),
                                          ...(trailingCharactersSuggestion
                                              ? [
                                                    getRoleReplacementQuickFix(
                                                        roleLocation,
                                                        trailingCharactersSuggestion,
                                                        'Allow additional characters at the end of the role',
                                                        false,
                                                    ),
                                                ]
                                              : []),
                                      ]
                                    : [],
                            },
                        ),
                    );
                }
                if (entry instanceof RegexRoleSpecifierEntry && entry.ignoredFlags) {
                    messages.push(
                        ValidationMessage.nonSuppressableWarning(
                            `Regular expression flags "g" and "y" have no effect in role specifiers. Remove them. This will be an error in a future release.`,
                            roleLocation,
                            {
                                quickFixes: roleLocation
                                    ? [
                                          getRoleReplacementQuickFix(
                                              roleLocation,
                                              role.replace(/[^/]*$/, (flags) =>
                                                  flags.replace(/[gy]/g, ''),
                                              ),
                                              'Remove flags "g" and "y"',
                                              true,
                                          ),
                                      ]
                                    : [],
                            },
                        ),
                    );
                }
            } catch (e) {
                if (e instanceof InvalidRoleSpecifierError) {
                    messages.push(ValidationMessage.error(e.message, roleLocation));
                } else {
                    throw e;
                }
            }
            roleIndex++;
        }

        if (
            hasRoleExpressionWithoutCaptureGroup &&
            isReadonlyArray(permission.restrictToAccessGroups)
        ) {
            let accessGroupIndex = 0;
            for (const accessGroupExpression of permission.restrictToAccessGroups) {
                if (
                    typeof accessGroupExpression === 'string' &&
                    accessGroupExpression.includes('$') &&
                    hasRoleExpressionWithoutCaptureGroup
                ) {
                    messages.push(
                        ValidationMessage.error(
                            'Can only use placeholders (like $1) in restrictToAccessGroups when all role expressions are regular expressions with capturing groups',
                            pathLocationMap[
                                `/permissionProfiles/${name}/permissions/${index}/restrictToAccessGroups/${accessGroupIndex}`
                            ],
                        ),
                    );
                }
                accessGroupIndex++;
            }
        }

        // placeholders that refer to capturing groups that do not exist are not replaced
        const templates: Array<{ template: unknown; path: string }> = [
            ...(isReadonlyArray(permission.restrictToAccessGroups)
                ? permission.restrictToAccessGroups.map((template: unknown, i: number) => ({
                      template,
                      path: `restrictToAccessGroups/${i}`,
                  }))
                : []),
            ...(isReadonlyArray(permission.restrictions)
                ? permission.restrictions.map((restriction: any, i: number) => ({
                      template: restriction?.valueTemplate,
                      path: `restrictions/${i}/valueTemplate`,
                  }))
                : []),
        ];
        for (const { template, path } of templates) {
            if (typeof template !== 'string') {
                continue;
            }
            const isAccessGroupTemplate = path.startsWith('restrictToAccessGroups');
            const placeholderNumbers = Array.from(template.matchAll(/\$(\d+)/g), (m) =>
                Number(m[1]),
            );
            if (!placeholderNumbers.length) {
                continue;
            }
            const maxPlaceholderNumber = Math.max(...placeholderNumbers);
            const insufficientRole = roleEntries.find(
                ({ entry }) =>
                    entry.capturingGroupCount < maxPlaceholderNumber &&
                    // this is already reported as an error
                    !(isAccessGroupTemplate && !entry.mayHaveCapturingGroups),
            );
            if (!insufficientRole) {
                continue;
            }
            const count = insufficientRole.entry.capturingGroupCount;
            messages.push(
                ValidationMessage.nonSuppressableWarning(
                    `Placeholder "$${maxPlaceholderNumber}" refers to capturing group ${maxPlaceholderNumber}, but role specifier "${insufficientRole.role}" only has ${count} capturing group${count === 1 ? '' : 's'}. All roles of a permission that uses placeholders must be regular expressions with enough capturing groups. This will be an error in a future release.`,
                    pathLocationMap[`/permissionProfiles/${name}/permissions/${index}/${path}`],
                ),
            );
        }

        return messages;
    }
}

function getRoleReplacementQuickFix(
    roleLocation: MessageLocation,
    newRole: string,
    description: string,
    isPreferred: boolean,
) {
    return new QuickFix({
        description,
        isPreferred,
        changeSet: new ChangeSet([createValueReplacementChange(roleLocation, undefined, newRole)]),
    });
}
