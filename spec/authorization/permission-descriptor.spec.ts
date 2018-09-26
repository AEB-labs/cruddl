import {
    PermissionDescriptor, PermissionResult, ProfileBasedPermissionDescriptor
} from '../../src/authorization/permission-descriptors';
import { Model, PermissionProfile, TypeKind } from '../../src/model';
import { AccessOperation, AuthContext } from '../../src/authorization/auth-basics';
import {
    BinaryOperationQueryNode, BinaryOperator, ConstBoolQueryNode, FieldQueryNode, LiteralQueryNode, QueryNode,
    VariableQueryNode
} from '../../src/query-tree';
import { ACCESS_GROUP_FIELD } from '../../src/schema/constants';
import { expect } from 'chai';


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
            expect(new MockPermissionDescriptor(ConstBoolQueryNode.TRUE).canAccess(authContext, operation)).to.equal(PermissionResult.GRANTED);
        });

        it('returns DENIED if constant false', () => {
            expect(new MockPermissionDescriptor(ConstBoolQueryNode.FALSE).canAccess(authContext, operation)).to.equal(PermissionResult.DENIED);
        });

        it('returns CONDITIONAL on anything else', () => {
            expect(new MockPermissionDescriptor(new LiteralQueryNode(true)).canAccess(authContext, operation)).to.equal(PermissionResult.CONDITIONAL);
        });
    })
});

describe('ProfileBasedPermissionDescriptor', () => {
    const profile = new PermissionProfile('permissions', [], {
        permissions: [{
            access: 'read',
            roles: [ 'theRole' ]
        }, {
            access: 'read',
            roles: [ 'restricted' ],
            restrictToAccessGroups: [ 'groupA', 'groupB' ]
        }]
    });
    const model = new Model({
        types: [{
            kind: TypeKind.ROOT_ENTITY,
            name: 'Test',
            fields: [
                {
                    name: ACCESS_GROUP_FIELD,
                    typeName: 'String'
                }
            ]
        }]
    });
    const descriptor = new ProfileBasedPermissionDescriptor(profile, model.getRootEntityTypeOrThrow('Test'));

    it('grants access if role matches', () => {
        expect(descriptor.canAccess({ authRoles: [ 'theRole', 'other' ]}, AccessOperation.READ)).to.equal(PermissionResult.GRANTED);
    });

    it('denies access if no role matches', () => {
        expect(descriptor.canAccess({ authRoles: [ 'theRole2' ]}, AccessOperation.READ)).to.equal(PermissionResult.DENIED);
    });

    it('denies write access if role matches but has only read permissions', () => {
        expect(descriptor.canAccess({ authRoles: [ 'theRole' ]}, AccessOperation.WRITE)).to.equal(PermissionResult.DENIED);
    });

    it('produces conditional QueryNode if only accessGroup-based permissions match', () => {
        expect(descriptor.canAccess({ authRoles: [ 'restricted' ]}, AccessOperation.READ)).to.equal(PermissionResult.CONDITIONAL);
        const instanceNode = new VariableQueryNode('instance');
        const condition = descriptor.getAccessCondition({ authRoles: [ 'restricted' ]}, AccessOperation.READ, instanceNode) as BinaryOperationQueryNode;
        expect(condition).to.be.an.instanceof(BinaryOperationQueryNode);
        expect((condition as BinaryOperationQueryNode).lhs).to.be.an.instanceof(FieldQueryNode);
        const fieldNode = (condition as BinaryOperationQueryNode).lhs as FieldQueryNode;
        expect(fieldNode.objectNode).to.equal(instanceNode);
        expect(condition.operator).to.equal(BinaryOperator.IN);
        expect(condition.rhs).to.be.an.instanceof(LiteralQueryNode);
        expect((condition.rhs as LiteralQueryNode).value).to.contain('groupA');
        expect((condition.rhs as LiteralQueryNode).value).to.contain('groupB');
    });
});
