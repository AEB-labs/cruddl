import { Permission, RoleSpecifier } from '../../src/authorization/permission-profile';
import { expect } from 'chai';

describe('RoleSpecifier', () => {
    it('it supports literal roles', () => {
        const roleSpecifier = new RoleSpecifier(['roleA', 'roleB']);
        expect(roleSpecifier.includesRole('roleA')).to.be.true('roleA');
        expect(roleSpecifier.includesRole('roleC')).to.be.false('roleC');
    });

    it('it supports roles with wildcards', () => {
        const roleSpecifier = new RoleSpecifier(['role*']);
        expect(roleSpecifier.includesRole('roleA')).to.be.true('roleA');
        expect(roleSpecifier.includesRole('role')).to.be.true('role');
        expect(roleSpecifier.includesRole('rolA')).to.be.false('rolA');
        expect(roleSpecifier.includesRole('theroleA')).to.be.false('theroleA');
    });
});
