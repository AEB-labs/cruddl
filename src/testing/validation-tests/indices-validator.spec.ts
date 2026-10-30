import { describe, expect, it } from 'vitest';
import {
    assertValidatorAcceptsAndDoesNotWarn,
    assertValidatorRejects,
    validate,
} from '../utils/source-validation-utils.js';

describe('indices validator', () => {
    it('accepts flawless index', () => {
        assertValidatorAcceptsAndDoesNotWarn(`
            type Foo @rootEntity(indices:[{ fields: ["foo" ]}]) { foo: String }
        `);
    });

    it('accepts index on enum type', () => {
        assertValidatorAcceptsAndDoesNotWarn(`
            enum Animal { CAT, DOG }
            type Foo @rootEntity(indices:[{ fields: ["animal" ]}]) { animal: Animal }
        `);
    });

    it('accepts index on multiple columns', () => {
        assertValidatorAcceptsAndDoesNotWarn(`
            type Foo @rootEntity(indices:[{ fields: ["foo", "bar" ]}]) { foo: String, bar: String }
        `);
    });

    it('accepts index on nested field', () => {
        assertValidatorAcceptsAndDoesNotWarn(`
            type Foo @rootEntity(indices:[{ fields: ["bar.baz" ]}]) { foo: String, bar: Bar }
            type Bar @entityExtension { baz: String }
        `);
    });

    it('rejects index with empty fields list', () => {
        assertValidatorRejects(
            `
            type Foo @rootEntity(indices:[{ fields: []}]) { foo: String }
        `,
            'An index must specify at least one field.',
        );
    });

    it('rejects index with bad fields syntax', () => {
        assertValidatorRejects(
            `
            type Foo @rootEntity(indices:[{ fields: ["asds#/asd"]}]) { foo: String }
        `,
            'An index field path should be field names separated by dots.',
        );
    });

    it('rejects index with unknown field in path', () => {
        assertValidatorRejects(
            `
            type Foo @rootEntity(indices:[{ fields: ["bar"]}]) { foo: String }
        `,
            'Type "Foo" does not have a field "bar".',
        );
    });

    it('rejects index on missing nested field', () => {
        assertValidatorRejects(
            `
            type Foo @rootEntity(indices:[{ fields: ["bar.bla"]}]) { foo: String, bar: Bar }
            type Bar @entityExtension { baz: String }
        `,
            'Type "Bar" does not have a field "bla".',
        );
    });

    it('rejects index on non-scalar field', () => {
        assertValidatorRejects(
            `
            type Foo @rootEntity(indices:[{ fields: ["bar"]}]) { foo: String, bar: Bar }
            type Bar @entityExtension { baz: String }
        `,
            'Indices can only be defined on scalar or enum fields, but the type of "Foo.bar" is an object type. Specify a dot-separated field path to create an index on an embedded object.',
        );
    });

    it('rejects index with sub-path in scalar', () => {
        assertValidatorRejects(
            `
            type Foo @rootEntity(indices:[{ fields: ["bar.baz"]}]) { foo: String, bar: String }
        `,
            'Type "String" is not an object type and cannot be navigated into.',
        );
    });

    it('rejects index on relation', () => {
        assertValidatorRejects(
            `
            type Foo @rootEntity(indices:[{ fields: ["bar.baz"]}]) { bar: Bar @relation }
            type Bar @rootEntity { baz: String }
        `,
            'Field "Foo.bar" resolves to a different root entity, but this path cannot traverse root entity boundaries.',
        );
    });

    it('rejects index on field of non-rootEntity', () => {
        assertValidatorRejects(
            `
            type Foo @valueObject { bar: String @unique }
        `,
            'Indices are only allowed in root entity fields. You can add indices to fields of embedded objects with @rootEntities(indices: [...]).',
        );
    });

    it('rejects index on field of JSON type', () => {
        assertValidatorRejects(
            `
            type Foo @rootEntity { bar: JSON @index }
        `,
            'Indices can not be defined on scalar fields of type "JSON", but the type of "Foo.bar" is "JSON".',
        );
        assertValidatorRejects(
            `
            type Foo @rootEntity { bar: JSON @unique }
        `,
            'Indices can not be defined on scalar fields of type "JSON", but the type of "Foo.bar" is "JSON".',
        );
        assertValidatorRejects(
            `
            type Foo @rootEntity(indices:[{ fields: ["bar"]}]) { bar: JSON }
        `,
            'Indices can not be defined on scalar fields of type "JSON", but the type of "Foo.bar" is "JSON".',
        );
    });

    it('rejects index on field of non-rootEntity', () => {
        assertValidatorRejects(
            `
            type Foo @childEntity { bar: String @index }
        `,
            'Indices are only allowed in root entity fields. You can add indices to fields of embedded objects with @rootEntities(indices: [...]).',
        );
    });

    it('rejects index field containing a parent field', () => {
        assertValidatorRejects(
            `
            type Root @rootEntity(indices: [ { fields: ["children.children.parent.key"] } ]) {
                children: [Child]
            }

            type Child @childEntity {
                children: [Grandchild]
                key: String
            }

            type Grandchild @childEntity {
                name: String
                parent: Child @parent
            }
        `,
            'Field "Grandchild.parent" is a parent field and cannot be used in a field path.',
        );
    });

    it('rejects index field containing a root field', () => {
        assertValidatorRejects(
            `
            type Root @rootEntity(indices: [ { fields: ["children.root.key"] } ]) {
                children: [Child]
                key: String
            }

            type Child @childEntity {
                name: String
                root: Root @root
            }
        `,
            'Field "Child.root" is a root field and cannot be used in a field path.',
        );
    });

    describe('index field paths', () => {
        const types = `
            type Delivery @rootEntity(indices: [{ fields: ["PATH"] }]) {
                deliveryNumber: String @key
                labels: [String]
                items: [DeliveryItem]
                processing: ProcessingInfo
                dimensions: Dimensions
                forwarder: Forwarder @reference(keyField: "forwarderKey")
                forwarderKey: String
                handlingUnits: [HandlingUnit] @relation
                numberOfItems: Int @collect(path: "items", aggregate: COUNT)
                numberOfHandlingUnits: Int @collect(path: "handlingUnits", aggregate: COUNT)
            }
            type DeliveryItem @childEntity {
                itemNumber: String
                tags: [String]
                packages: [Package]
                delivery: Delivery @root
            }
            type Package @childEntity {
                packageNumber: String
                item: DeliveryItem @parent
            }
            type ProcessingInfo @entityExtension {
                comment: String
            }
            type Dimensions @valueObject {
                weightInKg: Float
            }
            type Forwarder @rootEntity {
                forwarderKey: String @key
            }
            type HandlingUnit @rootEntity {
                handlingUnitNumber: String
                delivery: Delivery @relation(inverseOf: "handlingUnits")
            }
        `;

        /**
         * Validates an index with the given path and returns the messages with the text they point at
         */
        function getMessages(path: string) {
            const source = types.replace('PATH', path);
            const indicesEnd = source.indexOf(') {');
            return validate(source)
                .messages.filter((m) => m.location && m.location.start.offset < indicesEnd)
                .map(
                    (m) =>
                        `${m.severity}: ${m.message} @ ${source.slice(m.location!.start.offset, m.location!.end.offset)}`,
                );
        }

        it('accepts fields of child entities, entity extensions and value objects', () => {
            expect(getMessages('items.itemNumber')).to.deep.equal([]);
            expect(getMessages('processing.comment')).to.deep.equal([]);
            expect(getMessages('dimensions.weightInKg')).to.deep.equal([]);
        });

        it('accepts a list of scalars', () => {
            expect(getMessages('labels')).to.deep.equal([]);
        });

        it('accepts collect fields', () => {
            expect(getMessages('numberOfItems')).to.deep.equal([]);
        });

        it('rejects collect fields that traverse relations', () => {
            expect(getMessages('numberOfHandlingUnits')).to.deep.equal([
                'ERROR: Field "Delivery.numberOfHandlingUnits" resolves to a different root entity, but this path cannot traverse root entity boundaries. @ numberOfHandlingUnits',
            ]);
        });

        it('rejects unknown fields', () => {
            expect(getMessages('items.itemNumbr')).to.deep.equal([
                'ERROR: Type "DeliveryItem" does not have a field "itemNumbr". @ itemNumbr',
            ]);
        });

        it('rejects navigating into scalars', () => {
            expect(getMessages('deliveryNumber.length')).to.deep.equal([
                'ERROR: Type "String" is not an object type and cannot be navigated into. @ length',
            ]);
        });

        it('rejects references', () => {
            expect(getMessages('forwarder.forwarderKey')).to.deep.equal([
                'ERROR: Field "Delivery.forwarder" resolves to a different root entity, but this path cannot traverse root entity boundaries. @ forwarder',
            ]);
        });

        it('rejects relations', () => {
            expect(getMessages('handlingUnits.handlingUnitNumber')).to.deep.equal([
                'ERROR: Field "Delivery.handlingUnits" resolves to a different root entity, but this path cannot traverse root entity boundaries. @ handlingUnits',
            ]);
        });

        it('rejects parent fields', () => {
            expect(getMessages('items.packages.item.itemNumber')).to.deep.equal([
                'ERROR: Field "Package.item" is a parent field and cannot be used in a field path. @ item',
            ]);
        });

        it('rejects root fields', () => {
            expect(getMessages('items.delivery.deliveryNumber')).to.deep.equal([
                'ERROR: Field "DeliveryItem.delivery" is a root field and cannot be used in a field path. @ delivery',
            ]);
        });

        it('rejects paths with more than one list', () => {
            expect(getMessages('items.packages.packageNumber')).to.deep.equal([
                'ERROR: Index paths with more than one list field are not supported by ArangoDB (list fields: "Delivery.items", "DeliveryItem.packages"). @ "items.packages.packageNumber"',
            ]);
        });

        it('rejects empty segments', () => {
            expect(getMessages('items..itemNumber')).to.deep.equal([
                'ERROR: An index field path should be field names separated by dots. @ "items..itemNumber"',
            ]);
        });

        it('rejects references in field indices', () => {
            const source = `
                type Delivery @rootEntity {
                    forwarder: Forwarder @reference(keyField: "forwarderKey") @index
                    forwarderKey: String
                }
                type Forwarder @rootEntity {
                    forwarderKey: String @key
                }
            `;
            expect(
                validate(source).messages.map(
                    (m) =>
                        `${m.message} @ ${source.slice(m.location?.start.offset, m.location?.end.offset)}`,
                ),
            ).to.deep.equal([
                'Field "Delivery.forwarder" resolves to a different root entity, but this path cannot traverse root entity boundaries. @ @index',
            ]);
        });
    });
});
