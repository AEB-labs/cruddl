import { ParsedProjectSource, ParsedProjectSourceBaseKind, PathLocationMap } from '../../../config/parsed-project';
import { ValidationMessage } from '../../../model';
import { createRoleSpecifierEntry, InvalidRoleSpecifierError } from '../../../model/implementation/permission-profile';
import { flatMap } from '../../../utils/utils';
import { ParsedSourceValidator } from '../ast-validator';

export class PermissionProfileValidator implements ParsedSourceValidator {
    validate(source: ParsedProjectSource): ReadonlyArray<ValidationMessage> {
        if (source.kind != ParsedProjectSourceBaseKind.OBJECT) {
            return [];
        }

        const data = source.object;

        if (
            !data ||
            !data.permissionProfiles ||
            Array.isArray(data.permissionProfiles) ||
            typeof data.permissionProfiles !== 'object'
        ) {
            return [];
        }

        return flatMap(Object.entries(data.permissionProfiles as any), ([name, profile]) =>
            this.validatePermissionProfile({ profile, name, pathLocationMap: source.pathLocationMap })
        );
    }

    private validatePermissionProfile({
        profile,
        name,
        pathLocationMap
    }: {
        profile: any;
        name: string;
        pathLocationMap: PathLocationMap;
    }): ReadonlyArray<ValidationMessage> {
        if (!profile || !Array.isArray(profile.permissions)) {
            return [];
        }

        return flatMap(Object.entries(profile.permissions), ([index, permission]) =>
            this.validatePermission({ permission, name, pathLocationMap, index })
        );
    }

    private validatePermission({
        permission,
        name,
        index,
        pathLocationMap
    }: {
        permission: any;
        name: string;
        index: string;
        pathLocationMap: PathLocationMap;
    }): ReadonlyArray<ValidationMessage> {
        if (!permission || !Array.isArray(permission.roles)) {
            return [];
        }

        const messages: ValidationMessage[] = [];
        let roleIndex = 0;
        let hasRoleExpressionWithoutCaptureGroup = false;
        for (const role of permission.roles) {
            if (typeof role !== 'string') {
                continue;
            }
            try {
                const entry = createRoleSpecifierEntry(role);
                if (!entry.mayHaveCapturingGroups) {
                    hasRoleExpressionWithoutCaptureGroup = true;
                }
            } catch (e) {
                if (e instanceof InvalidRoleSpecifierError) {
                    messages.push(
                        ValidationMessage.error(
                            e.message,
                            pathLocationMap[`/permissionProfiles/${name}/permissions/${index}/roles/${roleIndex}`]
                        )
                    );
                } else {
                    throw e;
                }
            }
            roleIndex++;
        }

        if (hasRoleExpressionWithoutCaptureGroup && Array.isArray(permission.restrictToAccessGroups)) {
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
                            ]
                        )
                    );
                }
                accessGroupIndex++;
            }
        }

        return messages;
    }
}
