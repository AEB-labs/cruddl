import { describe, expect, it } from 'vitest';
import {
    expectSingleError,
    expectToBeValid,
    validate,
} from '../../testing/utils/model-validation-utils.js';
import type { NamespacedPermissionProfileConfigMap } from '../config/permissions.js';
import { TypeKind } from '../config/type.js';
import { Severity } from '../validation/message.js';
import { Model } from './model.js';

describe('Model', () => {
    const permissionProfiles: ReadonlyArray<NamespacedPermissionProfileConfigMap> = [
        {
            profiles: {
                default: {
                    permissions: [
                        {
                            access: 'read',
                            roles: ['admin'],
                        },
                    ],
                },
            },
        },
    ];

    it('accepts simple model', () => {
        const model = new Model({
            types: [
                {
                    name: 'Delivery',
                    kind: TypeKind.ROOT_ENTITY,
                    fields: [
                        {
                            name: 'deliveryNumber',
                            typeName: 'String',
                        },
                    ],
                },
                {
                    name: 'Shipment',
                    kind: TypeKind.ROOT_ENTITY,
                    fields: [
                        {
                            name: 'shipmentNumber',
                            typeName: 'String',
                        },
                    ],
                },
            ],
            permissionProfiles,
        });

        expectToBeValid(model);
    });

    it('rejects model with duplicate type names', () => {
        const model = new Model({
            types: [
                {
                    name: 'Delivery',
                    kind: TypeKind.ROOT_ENTITY,
                    fields: [
                        {
                            name: 'deliveryNumber',
                            typeName: 'String',
                        },
                    ],
                },
                {
                    name: 'Delivery',
                    kind: TypeKind.ROOT_ENTITY,
                    fields: [
                        {
                            name: 'deliveryNumber',
                            typeName: 'String',
                        },
                    ],
                },
            ],
            permissionProfiles,
        });

        const result = validate(model);
        expect(result.messages.length).to.equal(2);
        for (const message of result.messages) {
            expect(message.severity).to.equal(Severity.ERROR);
            expect(message.message).to.equal(`Duplicate type name: "Delivery".`);
        }
    });

    it('rejects model with reserved type names', () => {
        const model = new Model({
            types: [
                {
                    name: 'Int',
                    kind: TypeKind.ROOT_ENTITY,
                    fields: [
                        {
                            name: 'deliveryNumber',
                            typeName: 'String',
                        },
                    ],
                },
            ],
            permissionProfiles,
        });

        expectSingleError(model, `Type name "Int" is reserved by a built-in type.`);
    });
});
