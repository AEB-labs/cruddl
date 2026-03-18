import { describe, it } from 'vitest';
import { expectSingleMessage } from '../../../testing/utils/model-validation-utils.js';
import { TypeKind } from '../config/type.js';
import { Severity } from '../validation/message.js';
import { EntityExtensionType } from './entity-extension-type.js';
import { Model } from './model.js';

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
