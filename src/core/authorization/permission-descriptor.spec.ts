import { describe, expect, it } from 'vitest';
import { TypeKind } from '../model/config/type.js';
import { Model } from '../model/implementation/model.js';
import { PermissionProfile } from '../model/implementation/permission-profile.js';
import type { QueryNode } from '../query-tree/base.js';
import { ConstBoolQueryNode, LiteralQueryNode } from '../query-tree/literals.js';
import { BinaryOperationQueryNode, BinaryOperator } from '../query-tree/operators.js';
import { QuantifierFilterNode } from '../query-tree/quantifiers.js';
import { FieldQueryNode } from '../query-tree/queries.js';
import { VariableQueryNode } from '../query-tree/variables.js';
import { ACCESS_GROUP_FIELD } from '../schema/constants.js';
import type { AuthContext } from './auth-basics.js';
import { AccessOperation } from './auth-basics.js';
import {
    PermissionDescriptor,
    PermissionResult,
    ProfileBasedPermissionDescriptor,
} from './permission-descriptors.js';

describe('PermissionDescriptor', () => {
    describe('canAccess', () => {
        class MockPermissionDescriptor extends PermissionDescriptor {
            constructor(private result: QueryNode) {
                super();
            }
            getAccessCondition(
                authContext: AuthContext,
                operation: AccessOperation,
                accessGroupNode: QueryNode,
            ): QueryNode {
                return this.result;
            }
        }
        const authContext: AuthContext = { authRoles: [] };
        const operation = AccessOperation.READ;

        it('returns GRANTED if constant true', () => {
            expect(
                new MockPermissionDescriptor(ConstBoolQueryNode.TRUE).canAccess(
                    authContext,
                    operation,
                ),
            ).to.equal(PermissionResult.GRANTED);
        });

        it('returns DENIED if constant false', () => {
            expect(
                new MockPermissionDescriptor(ConstBoolQueryNode.FALSE).canAccess(
                    authContext,
                    operation,
                ),
            ).to.equal(PermissionResult.DENIED);
        });

        it('returns CONDITIONAL on anything else', () => {
            expect(
                new MockPermissionDescriptor(new LiteralQueryNode(true)).canAccess(
                    authContext,
                    operation,
                ),
            ).to.equal(PermissionResult.CONDITIONAL);
        });
    });
});

describe('ProfileBasedPermissionDescriptor', () => {
    const profile = new PermissionProfile('permissions', [], {
        permissions: [
            {
                access: 'read',
                roles: ['theRole'],
            },
            {
                access: 'read',
                roles: ['restricted'],
                restrictToAccessGroups: ['groupA', 'groupB'],
            },
        ],
    });
    const model = new Model({
        types: [
            {
                kind: TypeKind.ROOT_ENTITY,
                name: 'Test',
                fields: [
                    {
                        name: ACCESS_GROUP_FIELD,
                        typeName: 'String',
                    },
                ],
            },
        ],
    });
    const descriptor = new ProfileBasedPermissionDescriptor(
        profile,
        model.getRootEntityTypeOrThrow('Test'),
    );

    it('grants access if role matches', () => {
        expect(
            descriptor.canAccess({ authRoles: ['theRole', 'other'] }, AccessOperation.READ),
        ).to.equal(PermissionResult.GRANTED);
    });

    it('denies access if no role matches', () => {
        expect(descriptor.canAccess({ authRoles: ['theRole2'] }, AccessOperation.READ)).to.equal(
            PermissionResult.DENIED,
        );
    });

    it('denies write access if role matches but has only read permissions', () => {
        expect(descriptor.canAccess({ authRoles: ['theRole'] }, AccessOperation.UPDATE)).to.equal(
            PermissionResult.DENIED,
        );
    });

    it('produces conditional QueryNode if only accessGroup-based permissions match', () => {
        expect(descriptor.canAccess({ authRoles: ['restricted'] }, AccessOperation.READ)).to.equal(
            PermissionResult.CONDITIONAL,
        );
        const instanceNode = new VariableQueryNode('instance');
        const condition = descriptor.getAccessCondition(
            { authRoles: ['restricted'] },
            AccessOperation.READ,
            instanceNode,
        ) as BinaryOperationQueryNode;
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

describe('ProfileBasedPermissionDescriptor with restrictions on list fields', () => {
    const profile = new PermissionProfile('permissions', [], {
        permissions: [
            {
                access: 'readWrite',
                roles: ['tagged'],
                restrictions: [{ field: 'tags', claim: 'tags' }],
            },
            {
                access: 'readWrite',
                roles: ['categorized'],
                restrictions: [{ field: 'category', value: 'a' }],
            },
            {
                access: 'readWrite',
                roles: ['tagged-or-categorized'],
                restrictions: [{ field: 'tags', claim: 'tags' }],
            },
            {
                access: 'readWrite',
                roles: ['tagged-or-categorized'],
                restrictions: [{ field: 'category', value: 'a' }],
            },
        ],
    });
    const model = new Model({
        types: [
            {
                kind: TypeKind.ROOT_ENTITY,
                name: 'Test',
                fields: [
                    { name: 'tags', typeName: 'String', isList: true, isAccessField: true },
                    { name: 'category', typeName: 'String', isAccessField: true },
                ],
            },
        ],
    });
    const descriptor = new ProfileBasedPermissionDescriptor(
        profile,
        model.getRootEntityTypeOrThrow('Test'),
    );
    const taggedAuthContext: AuthContext = {
        authRoles: ['tagged'],
        claims: { tags: ['tag1', 'tag2'] },
    };
    const categorizedAuthContext: AuthContext = { authRoles: ['categorized'] };

    it('uses ANY_IN for list fields', () => {
        const condition = descriptor.getAccessCondition(
            taggedAuthContext,
            AccessOperation.READ,
            new VariableQueryNode('instance'),
        );
        expect(condition).to.be.an.instanceof(BinaryOperationQueryNode);
        const binaryOp = condition as BinaryOperationQueryNode;
        expect(binaryOp.operator).to.equal(BinaryOperator.ANY_IN);
        expect((binaryOp.rhs as LiteralQueryNode).value).to.deep.equal(['tag1', 'tag2']);
    });

    it('uses EQUAL for scalar fields', () => {
        const condition = descriptor.getAccessCondition(
            categorizedAuthContext,
            AccessOperation.READ,
            new VariableQueryNode('instance'),
        );
        expect(condition).to.be.an.instanceof(BinaryOperationQueryNode);
        expect((condition as BinaryOperationQueryNode).operator).to.equal(BinaryOperator.EQUAL);
    });

    it('checks added and removed list items', () => {
        const oldNode = new VariableQueryNode('old');
        const newNode = new VariableQueryNode('new');
        const condition = descriptor.getListChangeCondition(
            taggedAuthContext,
            AccessOperation.UPDATE,
            oldNode,
            newNode,
        );

        // every item of (new - old) and of (old - new) needs to fulfill the access condition on its own
        expect(condition).to.be.an.instanceof(BinaryOperationQueryNode);
        const binaryOp = condition as BinaryOperationQueryNode;
        expect(binaryOp.operator).to.equal(BinaryOperator.AND);
        const [added, removed] = [binaryOp.lhs, binaryOp.rhs] as QuantifierFilterNode[];
        for (const quantifierNode of [added, removed]) {
            expect(quantifierNode).to.be.an.instanceof(QuantifierFilterNode);
            expect(quantifierNode.quantifier).to.equal('every');
            expect(quantifierNode.listNode).to.be.an.instanceof(BinaryOperationQueryNode);
            expect((quantifierNode.listNode as BinaryOperationQueryNode).operator).to.equal(
                BinaryOperator.SUBTRACT_LISTS,
            );
            // the item is checked with the restriction on the list field
            const itemCondition = quantifierNode.conditionNode as BinaryOperationQueryNode;
            expect(itemCondition.operator).to.equal(BinaryOperator.ANY_IN);
            expect((itemCondition.rhs as LiteralQueryNode).value).to.deep.equal(['tag1', 'tag2']);
        }
        const addedList = added.listNode as BinaryOperationQueryNode;
        const removedList = removed.listNode as BinaryOperationQueryNode;
        expect(addedList.lhs).to.equal(removedList.rhs);
        expect(addedList.rhs).to.equal(removedList.lhs);
    });

    it('does not check list items if no list field is restricted', () => {
        const condition = descriptor.getListChangeCondition(
            categorizedAuthContext,
            AccessOperation.UPDATE,
            new VariableQueryNode('old'),
            new VariableQueryNode('new'),
        );
        expect(condition).to.equal(ConstBoolQueryNode.TRUE);
    });

    it('checks changed list items per object if another permission does not restrict the list field', () => {
        // whether the other permission lifts the restriction depends on the object, so this can't be decided statically
        const newInstanceNode = new VariableQueryNode('new');
        const condition = descriptor.getListChangeCondition(
            { authRoles: ['tagged-or-categorized'], claims: { tags: ['tag1'] } },
            AccessOperation.UPDATE,
            new VariableQueryNode('old'),
            newInstanceNode,
        );

        // the other permission is checked first so the item checks can be skipped
        expect(condition).to.be.an.instanceof(BinaryOperationQueryNode);
        const binaryOp = condition as BinaryOperationQueryNode;
        expect(binaryOp.operator).to.equal(BinaryOperator.OR);
        const unrestrictedCondition = binaryOp.lhs as BinaryOperationQueryNode;
        expect(unrestrictedCondition.operator).to.equal(BinaryOperator.EQUAL);
        expect((unrestrictedCondition.lhs as FieldQueryNode).objectNode).to.equal(newInstanceNode);
        expect((unrestrictedCondition.lhs as FieldQueryNode).field.name).to.equal('category');
    });

    it('does not check list items if the list field is not affected', () => {
        const condition = descriptor.getListChangeCondition(
            taggedAuthContext,
            AccessOperation.UPDATE,
            new VariableQueryNode('old'),
            new VariableQueryNode('new'),
            () => false,
        );
        expect(condition).to.equal(ConstBoolQueryNode.TRUE);
    });
});
