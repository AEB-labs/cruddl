import { Permission, RoleSpecifier } from '../../src/authorization/permission-profile';

describe('RoleSpecifier', () => {
    it('it supports literal roles', () => {
        const roleSpecifier = new RoleSpecifier(['roleA', 'roleB']);
        expect(roleSpecifier.includesRole('roleA')).toBeTruthy('roleA');
        expect(roleSpecifier.includesRole('roleC')).toBeFalsy('roleC');
    });

    it('it supports roles with wildcards', () => {
        const roleSpecifier = new RoleSpecifier(['role*']);
        expect(roleSpecifier.includesRole('roleA')).toBeTruthy('roleA');
        expect(roleSpecifier.includesRole('role')).toBeTruthy('role');
        expect(roleSpecifier.includesRole('rolA')).toBeFalsy('rolA');
        expect(roleSpecifier.includesRole('theroleA')).toBeFalsy('theroleA');
    });
});
