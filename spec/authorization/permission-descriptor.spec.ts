import {
    PermissionResult, PermissionDescriptor, ProfileBasedPermissionDescriptor
} from '../../src/authorization/permission-descriptors';
import { PermissionProfile } from '../../src/authorization/permission-profile';
import { AccessOperation, AuthContext } from '../../src/authorization/auth-basics';
import {
    BinaryOperationQueryNode, BinaryOperator, ConstBoolQueryNode, LiteralQueryNode, QueryNode, VariableQueryNode
} from '../../src/query/definition';
import any = jasmine.any;

describe('PermissionDescriptor', () => {
    describe('canAccess', () => {
        class MockPermissionDescriptor extends PermissionDescriptor {
            constructor(private result: QueryNode) { super(); }
            getAccessCondition(authContext: AuthContext, operation: AccessOperation, accessGroupNode: QueryNode): QueryNode {
                return this.result;
            }
        }
        const authContext: AuthContext = { authRoles: [] };
        const operation = AccessOperation.READ;

        it('returns GRANTED if constant true', () => {
            expect(new MockPermissionDescriptor(ConstBoolQueryNode.TRUE).canAccess(authContext, operation)).toBe(PermissionResult.GRANTED);
        });

        it('returns DENIED if constant false', () => {
            expect(new MockPermissionDescriptor(ConstBoolQueryNode.FALSE).canAccess(authContext, operation)).toBe(PermissionResult.DENIED);
        });

        it('returns CONDITIONAL on anything else', () => {
            expect(new MockPermissionDescriptor(new LiteralQueryNode(true)).canAccess(authContext, operation)).toBe(PermissionResult.CONDITIONAL);
        });
    })
});

describe('ProfileBasedPermissionDescriptor', () => {
    const profile = new PermissionProfile({
        permissions: [{
            access: 'read',
            roles: [ 'theRole' ]
        }, {
            access: 'read',
            roles: [ 'restricted' ],
            restrictToAccessGroups: [ 'groupA', 'groupB' ]
        }]
    });
    const descriptor = new ProfileBasedPermissionDescriptor(profile);

    it('grants access if role matches', () => {
        expect(descriptor.canAccess({ authRoles: [ 'theRole', 'other' ]}, AccessOperation.READ)).toBe(PermissionResult.GRANTED);
    });

    it('denies access if no role matches', () => {
        expect(descriptor.canAccess({ authRoles: [ 'theRole2' ]}, AccessOperation.READ)).toBe(PermissionResult.DENIED);
    });

    it('denies write access if role matches but has only read permissions', () => {
        expect(descriptor.canAccess({ authRoles: [ 'theRole' ]}, AccessOperation.WRITE)).toBe(PermissionResult.DENIED);
    });

    it('produces conditional QueryNode if only accessGroup-based permissions match', () => {
        expect(descriptor.canAccess({ authRoles: [ 'restricted' ]}, AccessOperation.READ)).toBe(PermissionResult.CONDITIONAL);
        const accessGroupNode = new VariableQueryNode('accessGroup');
        const condition = descriptor.getAccessCondition({ authRoles: [ 'restricted' ]}, AccessOperation.READ, accessGroupNode);
        expect(condition).toEqual(any(BinaryOperationQueryNode));
        expect((condition as BinaryOperationQueryNode).lhs).toBe(accessGroupNode);
        expect((condition as BinaryOperationQueryNode).operator).toBe(BinaryOperator.IN);
        expect((condition as BinaryOperationQueryNode).rhs).toEqual(any(LiteralQueryNode));
        expect(((condition as BinaryOperationQueryNode).rhs as LiteralQueryNode).value).toEqual([ 'groupA', 'groupB']);
    });
});
