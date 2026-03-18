import { describe, expect, it } from 'vitest';
import { expectToBeValid, validate } from '../../../testing/utils/model-validation-utils.js';
import { TypeKind } from '../config/type.js';
import { Severity } from '../validation/message.js';
import { ChildEntityType } from './child-entity-type.js';
import { Model } from './model.js';

// This test uses a ChildEntityType because that is a concrete class without much addition to ObjectType, but it
// has system fields.
describe('ObjectType', () => {
    const model = new Model({
        types: [],
    });

    it('accepts simple type', () => {
        const type = new ChildEntityType(
            {
                kind: TypeKind.CHILD_ENTITY,
                name: 'Delivery',
                fields: [
                    {
                        name: 'deliveryNumber',
                        typeName: 'String',
                    },
                    {
                        name: 'shipmentNumber',
                        typeName: 'String',
                    },
                ],
            },
            model,
        );

        expectToBeValid(type);
    });

    it('rejects type with duplicate field names', () => {
        const type = new ChildEntityType(
            {
                kind: TypeKind.CHILD_ENTITY,
                name: 'Delivery',
                fields: [
                    {
                        name: 'deliveryNumber',
                        typeName: 'String',
                    },
                    {
                        name: 'deliveryNumber',
                        typeName: 'String',
                    },
                ],
            },
            model,
        );

        const result = validate(type);
        expect(result.messages.length).to.equal(2);
        for (const message of result.messages) {
            expect(message.severity).to.equal(Severity.ERROR);
            expect(message.message).to.equal(`Duplicate field name: "deliveryNumber".`);
        }
    });
});
