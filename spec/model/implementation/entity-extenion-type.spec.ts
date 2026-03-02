import { describe, it } from 'vitest';
import { TypeKind } from '../../../src/model/config/index.js';
import { EntityExtensionType, Model } from '../../../src/model/implementation/index.js';
import { Severity } from '../../../src/model/validation/index.js';
import { expectSingleMessage } from './validation-utils.js';

describe('EnityExtensionType', () => {
    it('rejects EntityExtensions with recursion', () => {
        const type = new EntityExtensionType(
            {
                kind: TypeKind.ENTITY_EXTENSION,
                name: 'DeliveryInfo',
                fields: [
                    {
                        name: 'deliveryInfo',
                        typeName: 'DeliveryInfo',
                    },
                ],
            },
            new Model({
                types: [
                    {
                        kind: TypeKind.ENTITY_EXTENSION,
                        name: 'DeliveryInfo',
                        fields: [
                            {
                                name: 'deliveryInfo',
                                typeName: 'DeliveryInfo',
                            },
                        ],
                    },
                ],
            }),
        );

        expectSingleMessage(
            type,
            `EntityTypes cannot recursively contain an EntityType of their own type.`,
            Severity.ERROR,
        );
    });

    it('rejects EntityExtensions with nested recursion', () => {
        const type = new EntityExtensionType(
            {
                kind: TypeKind.ENTITY_EXTENSION,
                name: 'DeliveryInfo',
                fields: [
                    {
                        name: 'otherInfo',
                        typeName: 'OtherInfo',
                    },
                ],
            },
            new Model({
                types: [
                    {
                        kind: TypeKind.ENTITY_EXTENSION,
                        name: 'DeliveryInfo',
                        fields: [
                            {
                                name: 'deliveryInfo',
                                typeName: 'DeliveryInfo',
                            },
                        ],
                    },
                    {
                        kind: TypeKind.ENTITY_EXTENSION,
                        name: 'OtherInfo',
                        fields: [
                            {
                                name: 'deliveryInfo',
                                typeName: 'DeliveryInfo',
                            },
                        ],
                    },
                ],
            }),
        );

        expectSingleMessage(
            type,
            `EntityTypes cannot recursively contain an EntityType of their own type.`,
            Severity.ERROR,
        );
    });
});
