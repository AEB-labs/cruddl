import { ChangeSet } from '../../../model/change-set/change-set.js';
import { createValueReplacementChange } from '../../../model/change-set/replace-value.js';
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
                if (!entry.mayHaveCapturingGroups) {
                    hasRoleExpressionWithoutCaptureGroup = true;
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
