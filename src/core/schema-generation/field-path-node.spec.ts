import { describe, expect, it } from 'vitest';
import { TypeKind } from '../model/config/type.js';
import { Model } from '../model/implementation/model.js';
import { ListQueryNode } from '../query-tree/lists.js';
import { LiteralQueryNode, NullQueryNode } from '../query-tree/literals.js';
import {
    MergeObjectsQueryNode,
    ObjectQueryNode,
    PropertySpecification,
} from '../query-tree/objects.js';
import { FieldQueryNode } from '../query-tree/queries.js';
import { SafeListQueryNode } from '../query-tree/type-check.js';
import { VariableQueryNode } from '../query-tree/variables.js';
import { createFieldPathNode } from './field-path-node.js';

describe('createFieldPathNode', () => {
    const model = new Model({
        types: [
            {
                kind: TypeKind.ROOT_ENTITY,
                name: 'Shipment',
                fields: [
                    { name: 'name', typeName: 'String' },
                    { name: 'tags', typeName: 'String', isList: true },
                    { name: 'details', typeName: 'Details' },
                ],
            },
            {
                kind: TypeKind.VALUE_OBJECT,
                name: 'Details',
                fields: [{ name: 'note', typeName: 'String' }],
            },
        ],
    });
    const shipmentType = model.getRootEntityTypeOrThrow('Shipment');
    const nameField = shipmentType.getFieldOrThrow('name');
    const tagsField = shipmentType.getFieldOrThrow('tags');
    const detailsField = shipmentType.getFieldOrThrow('details');
    const noteField = model.getValueObjectTypeOrThrow('Details').getFieldOrThrow('note');

    function merge(...objectNodes: ReadonlyArray<VariableQueryNode | ObjectQueryNode>) {
        return new MergeObjectsQueryNode(objectNodes);
    }

    function object(
        properties: Record<
            string,
            VariableQueryNode | LiteralQueryNode | ObjectQueryNode | MergeObjectsQueryNode
        >,
    ) {
        return new ObjectQueryNode(
            Object.entries(properties).map(
                ([name, value]) => new PropertySpecification(name, value),
            ),
        );
    }

    it('reads a field from the object that sets it', () => {
        const value = new LiteralQueryNode('new name');
        const node = createFieldPathNode(
            [nameField],
            merge(new VariableQueryNode('doc'), object({ name: value })),
        );
        expect(node).to.equal(value);
    });

    it('uses the last object that sets the field', () => {
        const first = new LiteralQueryNode('first');
        const second = new LiteralQueryNode('second');
        const node = createFieldPathNode(
            [nameField],
            merge(new VariableQueryNode('doc'), object({ name: first }), object({ name: second })),
        );
        expect(node).to.equal(second);
    });

    it('reads other fields from the original object', () => {
        const docNode = new VariableQueryNode('doc');
        const node = createFieldPathNode(
            [nameField],
            merge(docNode, object({ other: new LiteralQueryNode(1) })),
        );
        expect(node).to.be.an.instanceof(FieldQueryNode);
        expect((node as FieldQueryNode).objectNode).to.equal(docNode);
        expect((node as FieldQueryNode).field).to.equal(nameField);
    });

    it('does not look past objects with unknown properties', () => {
        const value = new LiteralQueryNode('name');
        const otherNode = new VariableQueryNode('other');
        const node = createFieldPathNode(
            [nameField],
            merge(object({ name: value }), otherNode, object({ other: new LiteralQueryNode(1) })),
        );
        expect(node).to.be.an.instanceof(FieldQueryNode);
        expect((node as FieldQueryNode).objectNode).to.be.an.instanceof(MergeObjectsQueryNode);
    });

    it('evaluates to null if no object sets the field', () => {
        const node = createFieldPathNode([nameField], merge(object({}), object({})));
        expect(node).to.equal(NullQueryNode.NULL);
    });

    it('evaluates to an empty list for list fields if no object sets the field', () => {
        const node = createFieldPathNode([tagsField], merge(object({}), object({})));
        expect(node).to.equal(ListQueryNode.EMPTY);
    });

    it('keeps list values of list fields', () => {
        const value = new LiteralQueryNode(['a', 'b']);
        const node = createFieldPathNode(
            [tagsField],
            merge(new VariableQueryNode('doc'), object({ tags: value })),
        );
        expect(node).to.equal(value);
    });

    it('ensures list fields evaluate to lists', () => {
        const value = new VariableQueryNode('value');
        const node = createFieldPathNode(
            [tagsField],
            merge(new VariableQueryNode('doc'), object({ tags: value })),
        );
        expect(node).to.be.an.instanceof(SafeListQueryNode);
        expect((node as SafeListQueryNode).sourceNode).to.equal(value);
    });

    it('reads nested fields from nested merged objects', () => {
        const value = new LiteralQueryNode('new note');
        const node = createFieldPathNode(
            [detailsField, noteField],
            merge(
                new VariableQueryNode('doc'),
                object({
                    details: merge(new VariableQueryNode('details'), object({ note: value })),
                }),
            ),
        );
        expect(node).to.equal(value);
    });
});
