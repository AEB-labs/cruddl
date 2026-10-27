import { describe, expect, it } from 'vitest';
import {
    expectSingleError,
    expectSingleWarning,
} from '../../../testing/utils/model-validation-utils.js';
import { TypeKind } from '../config/type.js';
import { FieldPath } from './field-path.js';
import { Model } from './model.js';

describe('FieldPath', () => {
    const model = new Model({
        types: [
            {
                kind: TypeKind.ROOT_ENTITY,
                name: 'Shipment',
                fields: [
                    { name: 'items', typeName: 'Item', isList: true },
                    { name: 'customer', typeName: 'Customer', isReference: true },
                ],
            },
            {
                kind: TypeKind.VALUE_OBJECT,
                name: 'Item',
                fields: [{ name: 'name', typeName: 'String' }],
            },
            {
                kind: TypeKind.ROOT_ENTITY,
                name: 'Customer',
                fields: [{ name: 'name', typeName: 'String' }],
            },
        ],
    });
    const baseType = model.getRootEntityTypeOrThrow('Shipment');

    it('rejects navigating into lists', () => {
        const fieldPath = new FieldPath({ path: 'items.name', baseType });
        expectSingleError(
            fieldPath,
            'Field "Shipment.items" is a list and cannot be navigated into.',
        );
        expect(fieldPath.fields).to.deep.equal([]);
    });

    it('accepts navigating into lists if allowed', () => {
        const fieldPath = new FieldPath({
            path: 'items.name',
            baseType,
            canNavigateIntoLists: true,
        });
        expect(fieldPath.fields?.map((f) => f.name)).to.deep.equal(['items', 'name']);
    });

    it('reports navigating into lists as deprecation if configured', () => {
        const fieldPath = new FieldPath({
            path: 'items.name',
            baseType,
            reportInvalidNavigationAsDeprecation: true,
        });
        expectSingleWarning(
            fieldPath,
            'Field "Shipment.items" is a list and cannot be navigated into. This will be an error in a future release.',
        );
        expect(fieldPath.fields?.map((f) => f.name)).to.deep.equal(['items', 'name']);
    });

    it('rejects following references if not allowed', () => {
        const fieldPath = new FieldPath({
            path: 'customer.name',
            baseType,
            canFollowReferences: false,
        });
        expectSingleError(
            fieldPath,
            'Field "Shipment.customer" is a reference and cannot be navigated into.',
        );
    });

    it('reports following references as deprecation if configured', () => {
        const fieldPath = new FieldPath({
            path: 'customer.name',
            baseType,
            canFollowReferences: false,
            reportInvalidNavigationAsDeprecation: true,
        });
        expectSingleWarning(
            fieldPath,
            'Field "Shipment.customer" is a reference and cannot be navigated into. This will be an error in a future release.',
        );
        expect(fieldPath.fields?.map((f) => f.name)).to.deep.equal(['customer', 'name']);
    });
});
