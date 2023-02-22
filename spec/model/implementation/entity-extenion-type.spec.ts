import { TypeKind } from '../../../src/model/config';
import { EntityExtensionType, Model } from '../../../src/model/implementation';
import { Severity } from '../../../src/model/validation';
import { expectSingleMessageToInclude } from './validation-utils';

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

        expectSingleMessageToInclude(
            type,
            `EntityTypes cannot recursively contain an EntityType of their own type.`,
            Severity.Error,
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

        expectSingleMessageToInclude(
            type,
            `EntityTypes cannot recursively contain an EntityType of their own type.`,
            Severity.Error,
        );
    });
});
