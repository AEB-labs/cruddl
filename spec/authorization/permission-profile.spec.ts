import { expect } from 'chai';
import { Permission, RoleSpecifier } from '../../src/model';
import { InvalidRoleSpecifierError } from '../../src/model/implementation/permission-profile';

describe('Permission', () => {
    describe('getAllowedAccessGroups', () => {
        it('gets literal access groups when roles match', () => {
            const permission = new Permission({
                access: 'read',
                restrictToAccessGroups: ['ag1', 'ag2'],
                roles: ['role'],
            });
            expect(permission.getAllowedAccessGroups({ authRoles: ['role'] })).to.deep.equal([
                'ag1',
                'ag2',
            ]);
        });

        it('gets empty list when roles do not match', () => {
            const permission = new Permission({
                access: 'read',
                restrictToAccessGroups: ['ag1', 'ag2'],
                roles: ['role'],
            });
            expect(permission.getAllowedAccessGroups({ authRoles: ['other-role'] })).to.deep.equal(
                [],
            );
        });

        it('gets dynamic access group', () => {
            const permission = new Permission({
                access: 'read',
                restrictToAccessGroups: ['dynamic-$1'],
                roles: ['/^role-(.*)$/'],
            });
            expect(permission.getAllowedAccessGroups({ authRoles: ['role-test'] })).to.deep.equal([
                'dynamic-test',
            ]);
        });

        it('gets static and dynamic access group', () => {
            const permission = new Permission({
                access: 'read',
                restrictToAccessGroups: ['static', 'dynamic-$1'],
                roles: ['/^role-(.*)$/', 'a-static-role'],
            });
            expect(permission.getAllowedAccessGroups({ authRoles: ['role-test'] })).to.deep.equal([
                'static',
                'dynamic-test',
            ]);
        });

        it('only gets static access group if no dynamic one matches', () => {
            const permission = new Permission({
                access: 'read',
                restrictToAccessGroups: ['static', 'dynamic-$1'],
                roles: ['/^role-(.*)$/', 'a-static-role'],
            });
            expect(
                permission.getAllowedAccessGroups({ authRoles: ['a-static-role'] }),
            ).to.deep.equal(['static']);
        });

        it('only gets static access group if dynamic one matches but has no capture groups', () => {
            const permission = new Permission({
                access: 'read',
                restrictToAccessGroups: ['static', 'dynamic-$1'],
                roles: ['/^role-.*$/', 'a-static-role'],
            });
            expect(
                permission.getAllowedAccessGroups({ authRoles: ['a-static-role'] }),
            ).to.deep.equal(['static']);
        });

        // this is unfortunate, but hard to verify
        it('gets dynamic access group with placeholders if role has the wrong caputure groups', () => {
            const permission = new Permission({
                access: 'read',
                restrictToAccessGroups: ['static', 'dynamic-$2'],
                roles: ['/^role-(.*)$/', 'a-static-role'],
            });
            expect(permission.getAllowedAccessGroups({ authRoles: ['role-abc'] })).to.deep.equal([
                'static',
                'dynamic-$2',
            ]);
        });
    });
});

describe('RoleSpecifier', () => {
    it('it supports literal roles', () => {
        const roleSpecifier = new RoleSpecifier(['roleA', 'roleB']);
        expect(roleSpecifier.includesRole('roleA')).to.be.true;
        expect(roleSpecifier.includesRole('roleC')).to.be.false;
    });

    it('it supports roles with wildcards', () => {
        const roleSpecifier = new RoleSpecifier(['role*']);
        expect(roleSpecifier.includesRole('roleA')).to.be.true;
        expect(roleSpecifier.includesRole('role')).to.be.true;
        expect(roleSpecifier.includesRole('rolA')).to.be.false;
        expect(roleSpecifier.includesRole('theroleA')).to.be.false;
    });

    it('it supports roles with regular expressions', () => {
        const roleSpecifier = new RoleSpecifier(['/role-[a-z]+/']);
        expect(roleSpecifier.includesRole('role-abc')).to.be.true;
        expect(roleSpecifier.includesRole('role-0123')).to.be.false;
        expect(roleSpecifier.includesRole('role-ABC')).to.be.false;
    });

    it('it supports roles with case-insensitive regular expressions', () => {
        const roleSpecifier = new RoleSpecifier(['/role-[a-z]+/i']);
        expect(roleSpecifier.includesRole('role-abc')).to.be.true;
        expect(roleSpecifier.includesRole('role-0123')).to.be.false;
        expect(roleSpecifier.includesRole('role-ABC')).to.be.true;
    });

    it('throws on invalid regular expressions', () => {
        expect(() => new RoleSpecifier(['/role-[a-z]+'])).to.throw(
            InvalidRoleSpecifierError,
            'Role specifier starts with a slash (/), but is not a valid regular expression: /role-[a-z]+',
        );
    });

    it('throws on invalid regular expressions (2)', () => {
        expect(() => new RoleSpecifier(['/role-[a-z+/'])).to.throw(
            InvalidRoleSpecifierError,
            'Invalid regular expression: /role-[a-z+/: Unterminated character class',
        );
    });
});
