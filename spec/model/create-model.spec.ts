import { expect } from 'chai';
import { DocumentNode } from 'graphql';
import gql from 'graphql-tag';
import { Project, ProjectSource } from '../../core-exports';
import { Severity, ValidationContext, createModel } from '../../src/model';
import { parseProject } from '../../src/schema/schema-builder';
import { expectSingleError, expectToBeValid } from './implementation/validation-utils';
import { createSimpleModel } from './model-spec.helper';

describe('createModel', () => {
    it('translates _key: String @key properly', () => {
        const document: DocumentNode = gql`
            type Test @rootEntity {
                _key: String @key
                test: String
            }
        `;
        const model = createSimpleModel(document);
        expect(model.validate().getErrors(), model.validate().toString()).to.deep.equal([]);
        const testType = model.getRootEntityTypeOrThrow('Test');
        expect(testType.fields.filter((f) => !f.isSystemField)).to.have.lengthOf(1); // only test should be a non-system field
        expect(testType.getField('_key')).to.be.undefined;
        expect(testType.getKeyFieldOrThrow().name).to.equal('id');
    });

    it('translates id: ID @key properly', () => {
        const document: DocumentNode = gql`
            type Test @rootEntity {
                id: ID @key
                test: String
            }
        `;
        const model = createSimpleModel(document);
        expect(model.validate().getErrors(), model.validate().toString()).to.deep.equal([]);
        const testType = model.getRootEntityTypeOrThrow('Test');
        expect(testType.fields.filter((f) => !f.isSystemField)).to.have.lengthOf(1); // only test should be a non-system field
        expect(testType.getField('_key')).to.be.undefined;
        expect(testType.getFieldOrThrow('id').isSystemField).to.be.true;
        expect(testType.getKeyFieldOrThrow().name).to.equal('id');
    });

    it('translates indices declared on root entity', () => {
        const document: DocumentNode = gql`
            type Test
                @rootEntity(
                    indices: [
                        { fields: "test" }
                        { fields: ["test", "id"], unique: true }
                        { fields: ["test", "id"], unique: true, sparse: false }
                    ]
                ) {
                test: String
            }
        `;
        const model = createSimpleModel(document);
        expect(model.validate().getErrors(), model.validate().toString()).to.deep.equal([]);
        const testType = model.getRootEntityTypeOrThrow('Test');

        const indexA = testType.indices[0];
        expect(indexA).not.to.be.undefined;
        expect(indexA!.fields.map((f) => f.path).join(',')).to.equal('test');
        expect(indexA!.unique).to.equal(false);
        expect(indexA!.sparse).to.equal(false);

        const indexB = testType.indices[1];
        expect(indexB).not.to.be.undefined;
        expect(indexB!.fields.map((f) => f.path).join(',')).to.equal('test,id');
        expect(indexB!.unique).to.equal(true);
        expect(indexB!.sparse).to.equal(true);

        const indexC = testType.indices[2];
        expect(indexC).not.to.be.undefined;
        expect(indexC!.fields.map((f) => f.path).join(',')).to.equal('test,id');
        expect(indexC!.unique).to.equal(true);
        expect(indexC!.sparse).to.equal(false);
    });

    it('translates indices declared on a field', () => {
        const document: DocumentNode = gql`
            type Test @rootEntity {
                testA: String @index
                testB: String @unique
                testC: String @unique(sparse: false)
            }
        `;
        const model = createSimpleModel(document);
        expect(model.validate().getErrors(), model.validate().toString()).to.deep.equal([]);
        const testType = model.getRootEntityTypeOrThrow('Test');

        const indexA = testType.indices.find(
            (index) => index.fields.map((f) => f.dotSeparatedPath).join(',') === 'testA',
        );
        expect(indexA).not.to.be.undefined;
        expect(indexA!.unique).to.equal(false);
        expect(indexA!.sparse).to.equal(false);

        const indexB = testType.indices.find(
            (index) => index.fields.map((f) => f.dotSeparatedPath).join(',') === 'testB',
        );
        expect(indexB).not.to.be.undefined;
        expect(indexB!.unique).to.equal(true);
        expect(indexB!.sparse).to.equal(true);

        const indexC = testType.indices.find(
            (index) => index.fields.map((f) => f.dotSeparatedPath).join(',') === 'testC',
        );
        expect(indexC).not.to.be.undefined;
        expect(indexC!.unique).to.equal(true);
        expect(indexC!.sparse).to.equal(false);
    });

    // We don't disallow combining @index and @unique because it can be useful when you want a sparse unique constraint,
    // but still be able to filter for null values.
    it('supports both @index and @unique on a single field', () => {
        const document: DocumentNode = gql`
            type Test @rootEntity {
                test: String @index @unique
            }
        `;

        const model = createSimpleModel(document);
        expect(model.validate().getErrors(), model.validate().toString()).to.deep.equal([]);
        const testType = model.getRootEntityTypeOrThrow('Test');

        const indices = testType.indices.filter(
            (i) => i.fields.length === 1 && i.fields[0].dotSeparatedPath === 'test',
        );
        expect(indices.length).to.equal(2);
        const [indexA, indexB] = indices;

        expect(indexA).not.to.be.undefined;
        expect(indexA!.unique).to.equal(false);
        expect(indexA!.sparse).to.equal(false);
        expect(indexB).not.to.be.undefined;
        expect(indexB!.unique).to.equal(true);
        expect(indexB!.sparse).to.equal(true);
    });

    it('respects @businessObject directive', () => {
        const document: DocumentNode = gql`
            type Test @rootEntity @businessObject {
                key: String
            }

            type Test2 @rootEntity {
                key: String
            }
        `;

        const model = createSimpleModel(document);
        expect(model.validate().getErrors(), model.validate().toString()).to.deep.equal([]);

        const type = model.getRootEntityTypeOrThrow('Test');
        expect(type.isBusinessObject).to.be.true;

        const type2 = model.getRootEntityTypeOrThrow('Test2');
        expect(type2.isBusinessObject).to.be.false;
    });

    it('enables flexSearch on key field by default', () => {
        const document: DocumentNode = gql`
            type Test @rootEntity(flexSearch: true) {
                key: String @key
            }
        `;

        const model = createSimpleModel(document);
        expect(model.validate().getErrors(), model.validate().toString()).to.deep.equal([]);

        const type = model.getRootEntityTypeOrThrow('Test');
        const field = type.getKeyFieldOrThrow();
        expect(field.isFlexSearchIndexed).to.be.true;
        expect(field.isIncludedInSearch).to.be.true;
    });

    it('enables does not include key field in search if explicitly disabled', () => {
        const document: DocumentNode = gql`
            type Test @rootEntity(flexSearch: true) {
                key: String @key @flexSearch(includeInSearch: false)
            }
        `;

        const model = createSimpleModel(document);
        expect(model.validate().getErrors(), model.validate().toString()).to.deep.equal([]);

        const type = model.getRootEntityTypeOrThrow('Test');
        const field = type.getKeyFieldOrThrow();
        expect(field.isFlexSearchIndexed).to.be.true;
        expect(field.isIncludedInSearch).to.be.false;
    });

    it('it allows to access raw label/labelPlural/hint localization on type "ObjectType" and its fields', () => {
        const document: DocumentNode = gql`
            type Shipment @rootEntity {
                shipmentNumber: String
            }
        `;
        const model = createSimpleModel(document, {
            de: {
                namespacePath: [],
                types: {
                    Shipment: {
                        label: 'Lieferung',
                        labelPlural: 'Lieferungen',
                        hint: 'Eine Lieferung',
                        fields: {
                            shipmentNumber: {
                                label: 'Lieferungsnummer',
                                hint: 'Die Nummer der Lieferung',
                            },
                        },
                    },
                },
            },
            en: {
                namespacePath: [],
                types: {
                    Shipment: {
                        label: 'Shipment',
                        labelPlural: 'Shipments',
                        hint: 'A shipment',
                        fields: {
                            shipmentNumber: {
                                label: 'Shipment number',
                                hint: 'The number of the shipment',
                            },
                        },
                    },
                },
            },
        });
        const shipmentType = model.getObjectTypeOrThrow('Shipment');
        expect(shipmentType.label).to.deep.equal({
            de: 'Lieferung',
            en: 'Shipment',
        });
        expect(shipmentType.labelPlural).to.deep.equal({
            de: 'Lieferungen',
            en: 'Shipments',
        });
        expect(shipmentType.hint).to.deep.equal({
            de: 'Eine Lieferung',
            en: 'A shipment',
        });
        const shipmentNumberField = shipmentType.getFieldOrThrow('shipmentNumber');
        expect(shipmentNumberField.label).to.deep.equal({
            de: 'Lieferungsnummer',
            en: 'Shipment number',
        });
        expect(shipmentNumberField.hint).to.deep.equal({
            de: 'Die Nummer der Lieferung',
            en: 'The number of the shipment',
        });
    });

    it('it allows to access raw label/labelPlural/hint localization on type "EnumType" and its values', () => {
        const document: DocumentNode = gql`
            type Shipment @rootEntity {
                transportKind: TransportKind
            }

            enum TransportKind {
                AIR
                SEA
                ROAD
            }
        `;
        const model = createSimpleModel(document, {
            de: {
                namespacePath: [],
                types: {
                    TransportKind: {
                        label: 'Transportart',
                        labelPlural: 'Transportarten',
                        hint: 'Die Art des Transports',
                        values: {
                            AIR: {
                                label: 'Luft',
                                hint: 'Lieferung mittels Fluchtfracht',
                            },
                            ROAD: {
                                label: 'Straße',
                                hint: 'Lieferung mittels LKW',
                            },
                            SEA: {
                                label: 'Übersee',
                                hint: 'Lieferung mittels Schiff',
                            },
                        },
                    },
                },
            },
            en: {
                namespacePath: [],
                types: {
                    TransportKind: {
                        label: 'Transport kind',
                        labelPlural: 'Transport kinds',
                        hint: 'The kind of transport',
                        values: {
                            AIR: {
                                label: 'Air',
                                hint: 'Delivery via airfreight',
                            },
                            ROAD: {
                                label: 'Road',
                                hint: 'Delivery via truck',
                            },
                            SEA: {
                                label: 'Sea',
                                hint: 'Delivery via ship',
                            },
                        },
                    },
                },
            },
        });
        const transportKindType = model.getEnumTypeOrThrow('TransportKind');
        expect(transportKindType.label).to.deep.equal({
            de: 'Transportart',
            en: 'Transport kind',
        });
        expect(transportKindType.labelPlural).to.deep.equal({
            de: 'Transportarten',
            en: 'Transport kinds',
        });
        expect(transportKindType.hint).to.deep.equal({
            de: 'Die Art des Transports',
            en: 'The kind of transport',
        });
        const valueAIR = transportKindType.values.find((value) => value.value === 'AIR');
        const valueROAD = transportKindType.values.find((value) => value.value === 'ROAD');
        const valueSEA = transportKindType.values.find((value) => value.value === 'SEA');
        expect(valueAIR?.label).to.deep.equal({
            de: 'Luft',
            en: 'Air',
        });
        expect(valueAIR?.hint).to.deep.equal({
            de: 'Lieferung mittels Fluchtfracht',
            en: 'Delivery via airfreight',
        });
        expect(valueROAD?.label).to.deep.equal({
            de: 'Straße',
            en: 'Road',
        });
        expect(valueROAD?.hint).to.deep.equal({
            de: 'Lieferung mittels LKW',
            en: 'Delivery via truck',
        });
        expect(valueSEA?.label).to.deep.equal({
            de: 'Übersee',
            en: 'Sea',
        });
        expect(valueSEA?.hint).to.deep.equal({
            de: 'Lieferung mittels Schiff',
            en: 'Delivery via ship',
        });
    });

    it('it allows to apply the hidden directive on regular and system fields', () => {
        const document: DocumentNode = gql`
            type Test @rootEntity {
                id: ID @hidden
                updatedAt: DateTime @hidden
                regularField: String!
                test2: Test2 @relation @hidden
            }

            type Test2 @rootEntity {
                dummy: String
            }
        `;

        const model = createSimpleModel(document);
        expect(model.validate().getErrors(), model.validate().toString()).to.deep.equal([]);

        const type = model.getRootEntityTypeOrThrow('Test');
        expect(type.getFieldOrThrow('id').isHidden).to.be.true;
        expect(type.getFieldOrThrow('updatedAt').isHidden).to.be.true;
        expect(type.getFieldOrThrow('createdAt').isHidden).to.be.false;
        expect(type.getFieldOrThrow('test2').isHidden).to.be.true;
    });

    describe('with modules', () => {
        it('extracts the module definitions', () => {
            const validationContext = new ValidationContext();
            const parsedProject = parseProject(
                new Project([
                    new ProjectSource(
                        'modules.json',
                        JSON.stringify({
                            modules: ['module1', 'module2'],
                        }),
                    ),
                ]),
                validationContext,
            );
            expectToBeValid(validationContext.asResult());
            const model = createModel(parsedProject, {
                withModuleDefinitions: true,
            });
            expectToBeValid(model);
            const modules = model.modules;
            expect(modules).to.have.lengthOf(2);
            const module1 = modules[0];
            expect(module1.name).to.equal('module1');
            expect(module1.loc?.start.offset).to.equal(12);
            expect(module1.loc?.end.offset).to.equal(21);
        });

        it('does not allow module declarations if withModuleDeclarations is not set', () => {
            const validationContext = new ValidationContext();
            const parsedProject = parseProject(
                new Project([
                    new ProjectSource(
                        'modules.json',
                        JSON.stringify({
                            modules: ['module1', 'module2'],
                        }),
                    ),
                ]),
                validationContext,
            );
            expectToBeValid(validationContext.asResult());
            const model = createModel(parsedProject);
            expectSingleError(model, 'Module declarations are not supported in this context.');
            const modules = model.modules;
            expect(modules).to.have.lengthOf(0);
        });

        it('does not allow duplicate module names', () => {
            const validationContext = new ValidationContext();
            const parsedProject = parseProject(
                new Project([
                    new ProjectSource(
                        'modules.json',
                        JSON.stringify({
                            modules: ['module1', 'module1'],
                        }),
                    ),
                ]),
                validationContext,
            );
            expectToBeValid(validationContext.asResult());
            const model = createModel(parsedProject, {
                withModuleDefinitions: true,
            });
            const validationResult = model.validate();
            expect(validationResult.messages.length).to.equal(2);
            expect(validationResult.messages[0].severity).to.equal(Severity.ERROR);
            expect(validationResult.messages[0].message).to.equal(
                'Duplicate module declaration: "module1".',
            );
            expect(validationResult.messages[1].severity).to.equal(Severity.ERROR);
            expect(validationResult.messages[1].message).to.equal(
                'Duplicate module declaration: "module1".',
            );
        });
    });
});
