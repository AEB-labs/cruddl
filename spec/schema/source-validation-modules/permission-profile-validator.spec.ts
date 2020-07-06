import { expect } from 'chai';
import { ValidationContext, ValidationMessage } from '../../../src/model/validation';
import { ProjectSource } from '../../../src/project/source';
import { PermissionProfileValidator } from '../../../src/schema/preparation/source-validation-modules/permission-profile-validator';
import { parseProjectSource } from '../../../src/schema/schema-builder';

describe('permission-profile-validator', () => {
    const validator = new PermissionProfileValidator();

    function getValidatorMessages(ps: ProjectSource): ReadonlyArray<ValidationMessage> {
        const parsedSource = parseProjectSource(ps, new ValidationContext());
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
                                    access: 'readWrite'
                                }
                            ]
                        }
                    }
                })
            )
        );
        expect(messages.length).to.equal(1);
        expect(messages[0].message).to.equal(
            'Role specifier starts with a slash (/), but is not a valid regular expression: /invalid-regex'
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
                                    restrictToAccessGroups: ['static-group', 'dynamic-$1']
                                }
                            ]
                        }
                    }
                })
            )
        );
        expect(messages.length).to.equal(1);
        expect(messages[0].message).to.equal(
            'Can only use placeholders (like $1) in restrictToAccessGroups when all role expressions are regular expressions with capturing groups'
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
                                    restrictToAccessGroups: ['static-group', 'dynamic-$1']
                                }
                            ]
                        }
                    }
                })
            )
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
                                    restrictToAccessGroups: ['static-group', 'static-2']
                                }
                            ]
                        }
                    }
                })
            )
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
                                    access: 'readWrite'
                                }
                            ]
                        }
                    }
                })
            )
        );
        expect(messages.length).to.equal(0);
    });
});
