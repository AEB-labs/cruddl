import { describe, expect, it } from 'vitest';
import { applyQuickFix } from '../../../../testing/utils/source-validation-utils.js';
import type { ValidationMessage } from '../../../model/validation/message.js';
import { Severity } from '../../../model/validation/message.js';
import { ValidationContext } from '../../../model/validation/validation-context.js';
import { ProjectSource } from '../../../project/source.js';
import { parseProjectSource } from '../../parsing/parse-project-source.js';
import { PermissionProfileValidator } from './permission-profile-validator.js';

describe('permission-profile-validator', () => {
    const validator = new PermissionProfileValidator();

    function getValidatorMessages(ps: ProjectSource): ReadonlyArray<ValidationMessage> {
        const parsedSource = parseProjectSource(ps, {}, new ValidationContext());
        if (parsedSource) {
            return validator.validate(parsedSource);
        }

        expect(parsedSource).to.not.be.undefined;
        throw new Error('Not reachable');
    }

    it('rejects invalid regular expressions in roles', () => {
        const messages = getValidatorMessages(
            new ProjectSource(
                'permission-profiles.json',
                JSON.stringify({
                    permissionProfiles: {
                        invalid: {
                            permissions: [
                                {
                                    roles: ['/invalid-regex'],
                                    access: 'readWrite',
                                },
                            ],
                        },
                    },
                }),
            ),
        );
        expect(messages.length).to.equal(1);
        expect(messages[0].message).to.equal(
            'Role specifier starts with a slash (/), but is not a valid regular expression: /invalid-regex',
        );
    });

    it('rejects dynamic access groups when not all roles have capture groups', () => {
        const messages = getValidatorMessages(
            new ProjectSource(
                'permission-profiles.json',
                JSON.stringify({
                    permissionProfiles: {
                        invalid: {
                            permissions: [
                                {
                                    roles: ['/^role-(.*)$/', 'static-role'],
                                    access: 'readWrite',
                                    restrictToAccessGroups: ['static-group', 'dynamic-$1'],
                                },
                            ],
                        },
                    },
                }),
            ),
        );
        expect(messages.length).to.equal(1);
        expect(messages[0].message).to.equal(
            'Can only use placeholders (like $1) in restrictToAccessGroups when all role expressions are regular expressions with capturing groups',
        );
    });

    it('accepts dynamic access groups when all roles have capture groups', () => {
        const messages = getValidatorMessages(
            new ProjectSource(
                'permission-profiles.json',
                JSON.stringify({
                    permissionProfiles: {
                        invalid: {
                            permissions: [
                                {
                                    roles: ['/^role-(.*)$/', '/^role2-(.*)$/'],
                                    access: 'readWrite',
                                    restrictToAccessGroups: ['static-group', 'dynamic-$1'],
                                },
                            ],
                        },
                    },
                }),
            ),
        );
        expect(messages.length).to.equal(0);
    });

    it('accepts static access groups', () => {
        const messages = getValidatorMessages(
            new ProjectSource(
                'permission-profiles.json',
                JSON.stringify({
                    permissionProfiles: {
                        invalid: {
                            permissions: [
                                {
                                    roles: ['/^role-(.*)$/', 'static-role'],
                                    access: 'readWrite',
                                    restrictToAccessGroups: ['static-group', 'static-2'],
                                },
                            ],
                        },
                    },
                }),
            ),
        );
        expect(messages.length).to.equal(0);
    });

    it('accepts permissions without access groups', () => {
        const messages = getValidatorMessages(
            new ProjectSource(
                'permission-profiles.json',
                JSON.stringify({
                    permissionProfiles: {
                        invalid: {
                            permissions: [
                                {
                                    roles: ['/^role-(.*)$/', 'static-role'],
                                    access: 'readWrite',
                                },
                            ],
                        },
                    },
                }),
            ),
        );
        expect(messages.length).to.equal(0);
    });

    it('warns about g and y flags in regular expressions in roles', () => {
        const messages = getValidatorMessages(
            new ProjectSource(
                'permission-profiles.json',
                JSON.stringify({
                    permissionProfiles: {
                        flags: {
                            permissions: [
                                {
                                    roles: ['/^role-(.*)$/gi'],
                                    access: 'readWrite',
                                },
                            ],
                        },
                    },
                }),
            ),
        );
        expect(messages.length).to.equal(1);
        expect(messages[0].severity).to.equal(Severity.WARNING);
        expect(messages[0].message).to.equal(
            'Regular expression flags "g" and "y" have no effect in role specifiers. Remove them. This will be an error in a future release.',
        );
    });

    it('offers to remove the g and y flags', () => {
        const source = new ProjectSource(
            'permission-profiles.json',
            JSON.stringify({
                permissionProfiles: {
                    flags: { permissions: [{ roles: ['/^role-(.*)$/gyi'], access: 'readWrite' }] },
                },
            }),
        );
        expect(applyQuickFix(getValidatorMessages(source), 'Remove flags "g" and "y"')).to.equal(
            source.body.replace('"/^role-(.*)$/gyi"', '"/^role-(.*)$/i"'),
        );
    });

    function getMessagesForPermission(permission: object) {
        return getValidatorMessages(
            new ProjectSource(
                'permission-profiles.json',
                JSON.stringify({
                    permissionProfiles: {
                        profile: {
                            permissions: [{ access: 'readWrite', ...permission }],
                        },
                    },
                }),
            ),
        );
    }

    it('accepts placeholders in valueTemplate if all roles have enough capturing groups', () => {
        const messages = getMessagesForPermission({
            roles: ['/^seller-(.+)-(.+)$/', '/^buyer-(.+)-(.+)$/'],
            restrictions: [{ field: 'seller', valueTemplate: '$1-$2' }],
        });
        expect(messages).to.deep.equal([]);
    });

    it('warns about placeholders in valueTemplate with roles without capturing groups', () => {
        const messages = getMessagesForPermission({
            roles: ['/^seller-(.+)$/', 'admin'],
            restrictions: [{ field: 'seller', valueTemplate: '$1' }],
        });
        expect(messages.length).to.equal(1);
        expect(messages[0].severity).to.equal(Severity.WARNING);
        expect(messages[0].message).to.equal(
            'Placeholder "$1" refers to capturing group 1, but role specifier "admin" only has 0 capturing groups. All roles of a permission that uses placeholders must be regular expressions with enough capturing groups. This will be an error in a future release.',
        );
    });

    it('warns about placeholders in valueTemplate that refer to missing capturing groups', () => {
        const messages = getMessagesForPermission({
            roles: ['/^seller-(.+)$/'],
            restrictions: [{ field: 'seller', valueTemplate: '$2' }],
        });
        expect(messages.length).to.equal(1);
        expect(messages[0].message).to.equal(
            'Placeholder "$2" refers to capturing group 2, but role specifier "/^seller-(.+)$/" only has 1 capturing group. All roles of a permission that uses placeholders must be regular expressions with enough capturing groups. This will be an error in a future release.',
        );
    });

    it('does not count non-capturing groups', () => {
        const messages = getMessagesForPermission({
            roles: ['/^(?:seller|buyer)-(.+)$/'],
            restrictions: [{ field: 'seller', valueTemplate: '$2' }],
        });
        expect(messages.length).to.equal(1);
        expect(messages[0].message).to.contain('only has 1 capturing group.');
    });

    it('warns about placeholders in restrictToAccessGroups that refer to missing capturing groups', () => {
        const messages = getMessagesForPermission({
            roles: ['/^role-(.+)$/'],
            restrictToAccessGroups: ['group-$2'],
        });
        expect(messages.length).to.equal(1);
        expect(messages[0].severity).to.equal(Severity.WARNING);
    });
});
