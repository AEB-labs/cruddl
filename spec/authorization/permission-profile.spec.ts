import { RoleSpecifier } from '../../src/authorization/permission-profile';
import { expect } from 'chai';

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
});
