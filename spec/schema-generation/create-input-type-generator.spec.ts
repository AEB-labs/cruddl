import { expect } from 'chai';
import { GraphQLEnumType, GraphQLInputObjectType, GraphQLList, GraphQLNonNull, GraphQLString } from 'graphql';
import { ChildEntityType, Model, RootEntityType, TypeKind } from '../../src/model';
import { CreateInputTypeGenerator, CreateObjectInputField } from '../../src/schema-generation/create-input-types';
import { EnumTypeGenerator } from '../../src/schema-generation/enum-type-generator';
import { FieldContext, SelectionToken } from '../../src/schema-generation/query-node-object-type';

describe('CreateInputTypeGenerator', () => {
    const model = new Model({ types: [] });

    const generator = new CreateInputTypeGenerator(new EnumTypeGenerator());

    const context: FieldContext = { selectionStack: [], selectionTokenStack: [], selectionToken: new SelectionToken() };

    describe('with simple scalar fields', () => {
        const type = new RootEntityType(
            {
                kind: TypeKind.ROOT_ENTITY,
                name: 'Hero',
                fields: [
                    {
                        name: 'name',
                        typeName: 'String'
                    }
                ]
            },
            model
        );
        const inputType = generator.generate(type);

        it('includes them in the input type', () => {
            expect(inputType.getInputType().getFields()['name'].type).to.equal(GraphQLString);
        });

        describe('prepare()', () => {
            it('includes it if specified', () => {
                const prepared = inputType.prepareValue({ name: 'Batman' }, context);
                expect(prepared.name).to.equal('Batman');
            });

            it('includes it if set to null', () => {
                // mimic the update case where setting to null does not remove the property but sets it to null
                const prepared = inputType.prepareValue({ name: null }, context);
                expect(prepared.name).to.be.null;
            });

            it('does not include it it if not specified', () => {
                const prepared = inputType.prepareValue({}, context);
                expect(prepared.name).to.be.undefined;
            });

            it('does not include non-existing fields', () => {
                const prepared = inputType.prepareValue({ somethingElse: 'yt' }, context);
                expect(prepared.somethingElse).to.be.undefined;
            });
        });

        describe('getAffectedFields()', () => {
            it('includes it if specified', () => {
                const fields = inputType.getAffectedFields({ name: 'Batman' }, context);
                expect(fields).to.deep.equal([type.getFieldOrThrow('name')]);
            });

            it('includes it if specified as null', () => {
                const fields = inputType.getAffectedFields({ name: null }, context);
                expect(fields).to.deep.equal([type.getFieldOrThrow('name')]);
            });

            it('does not include it if not specified', () => {
                const fields = inputType.getAffectedFields({}, context);
                expect(fields).be.empty;
            });
        });
    });

    describe('with enum fields', () => {
        const model = new Model({
            types: [
                {
                    kind: TypeKind.ENUM,
                    name: 'Morality',
                    values: [{ value: 'GOOD' }, { value: 'EVIL' }]
                }
            ]
        });

        const type = new RootEntityType(
            {
                kind: TypeKind.ROOT_ENTITY,
                name: 'Hero',
                fields: [
                    {
                        name: 'morality',
                        typeName: 'Morality'
                    }
                ]
            },
            model
        );
        const inputType = generator.generate(type);

        it('includes them in the input type', () => {
            expect(inputType.getInputType().getFields()['morality'].type).to.be.an.instanceOf(GraphQLEnumType);
        });

        describe('prepare()', () => {
            it('includes it if specified', () => {
                const prepared = inputType.prepareValue({ morality: 'EVIL' }, context);
                expect(prepared.morality).to.equal('EVIL');
            });

            it('includes it if set to null', () => {
                // mimic the update case where setting to null does not remove the property but sets it to null
                const prepared = inputType.prepareValue({ morality: null }, context);
                expect(prepared.morality).to.be.null;
            });

            it('does not include it it if not specified', () => {
                const prepared = inputType.prepareValue({}, context);
                expect(prepared.morality).to.be.undefined;
            });
        });

        describe('getAffectedFields()', () => {
            it('includes it if specified', () => {
                const fields = inputType.getAffectedFields({ morality: 'EVIL' }, context);
                expect(fields).to.deep.equal([type.getFieldOrThrow('morality')]);
            });

            it('includes it if specified as null', () => {
                const fields = inputType.getAffectedFields({ morality: null }, context);
                expect(fields).to.deep.equal([type.getFieldOrThrow('morality')]);
            });

            it('does not include it if not specified', () => {
                const fields = inputType.getAffectedFields({}, context);
                expect(fields).be.empty;
            });
        });
    });

    describe('with simple scalar fields with default value', () => {
        const type = new RootEntityType(
            {
                kind: TypeKind.ROOT_ENTITY,
                name: 'Hero',
                fields: [
                    {
                        name: 'name',
                        typeName: 'String',
                        defaultValue: 'Batman'
                    }
                ]
            },
            model
        );
        const inputType = generator.generate(type);

        describe('prepare()', () => {
            it('includes it if specified', () => {
                const prepared = inputType.prepareValue({ name: 'Hero' }, context);
                expect(prepared.name).to.equal('Hero');
            });

            it('includes default value if not specified', () => {
                const prepared = inputType.prepareValue({}, context);
                expect(prepared.name).to.equal('Batman');
            });

            it('keeps null values', () => {
                const prepared = inputType.prepareValue({ name: null }, context);
                expect(prepared.name).to.be.null;
            });
        });

        describe('getAffectedFields()', () => {
            it('includes it if specified', () => {
                const fields = inputType.getAffectedFields({ name: 'Hero' }, context);
                expect(fields).to.deep.equal([type.getFieldOrThrow('name')]);
            });

            it('does not include it if not specified', () => {
                const fields = inputType.getAffectedFields({}, context);
                expect(fields).to.deep.equal([]);
            });
        });
    });

    describe('with list scalar fields', () => {
        const type = new RootEntityType(
            {
                kind: TypeKind.ROOT_ENTITY,
                name: 'Hero',
                fields: [
                    {
                        name: 'nickNames',
                        typeName: 'String',
                        isList: true
                    }
                ]
            },
            model
        );
        const inputType = generator.generate(type);

        describe('input field', () => {
            const field = inputType.getInputType().getFields()['nickNames'];

            it('exists', () => {
                expect(field).not.to.be.undefined;
            });

            it('has correct type', () => {
                expect(field.type).to.deep.equal(new GraphQLList(new GraphQLNonNull(GraphQLString)));
            });
        });

        describe('prepare()', () => {
            it('includes it if specified', () => {
                const prepared = inputType.prepareValue({ nickNames: ['Dark Knight', 'Batsy'] }, context);
                expect(prepared.nickNames).to.deep.equal(['Dark Knight', 'Batsy']);
            });

            it('coerces to empty list if specified as null', () => {
                // when querying/filtering, null is interpreted as [] anyway, so avoid having a mix of both in the db
                const prepared = inputType.prepareValue({ nickNames: null }, context);
                expect(prepared.nickNames).to.deep.equal([]);
            });

            it('does not include it if not specified', () => {
                // when querying/filtering, null is interpreted as [] anyway, so avoid having a mix of both in the db
                const prepared = inputType.prepareValue({}, context);
                expect(prepared.nickNames).to.be.undefined;
            });
        });

        describe('getAffectedFields()', () => {
            it('includes it if specified', () => {
                const fields = inputType.getAffectedFields({ nickNames: ['Dark Knight', 'Batsy'] }, context);
                expect(fields).to.deep.equal([type.getFieldOrThrow('nickNames')]);
            });

            it('includes it if specified null', () => {
                const fields = inputType.getAffectedFields({ nickNames: null }, context);
                expect(fields).to.deep.equal([type.getFieldOrThrow('nickNames')]);
            });

            it('does not include it if not specified', () => {
                const fields = inputType.getAffectedFields({}, context);
                expect(fields).be.empty;
            });
        });
    });

    describe('with child entity fields', () => {
        const model = new Model({
            types: [
                {
                    kind: TypeKind.CHILD_ENTITY,
                    name: 'Movie',
                    fields: [
                        {
                            name: 'name',
                            typeName: 'String'
                        }
                    ]
                }
            ]
        });
        const type = new RootEntityType(
            {
                kind: TypeKind.ROOT_ENTITY,
                name: 'Hero',
                fields: [
                    {
                        name: 'movies',
                        typeName: 'Movie',
                        isList: true
                    }
                ]
            },
            model
        );
        const movieType = model.getChildEntityTypeOrThrow('Movie');
        const inputType = generator.generate(type);

        const movies = [
            { name: 'Batman Begins' },
            { name: 'The dark Knight Rises' },
            { name: 'The Dark Knight Rises' }
        ];

        describe('input field', () => {
            const field = inputType.getInputType().getFields()['movies'];

            it('exists', () => {
                expect(field).not.to.be.undefined;
            });

            it('has correct type', () => {
                expect(field.type).to.be.an.instanceOf(GraphQLList);
                expect((field.type as GraphQLList<any>).ofType).to.be.an.instanceOf(GraphQLNonNull);
                const movieInputType = (field.type as GraphQLList<GraphQLNonNull<any>>).ofType
                    .ofType as GraphQLInputObjectType;
                expect(movieInputType).to.be.an.instanceOf(GraphQLInputObjectType);
                expect(movieInputType.getFields()['name']).not.to.be.undefined;
                expect(movieInputType.getFields()['name'].type).to.equal(GraphQLString);
            });
        });

        describe('prepare()', () => {
            it('includes it if specified', () => {
                const prepared = inputType.prepareValue({ movies }, context) as any;
                expect(prepared.movies).to.be.an('array');
                expect(prepared.movies).to.have.lengthOf(3);
                expect(prepared.movies[0].name).to.equal('Batman Begins');
            });

            it('adds child-entity specific fields', () => {
                const prepared = inputType.prepareValue({ movies }, context) as any;
                expect(prepared.movies[0].id).to.be.a('string');
            });

            it('coerces to empty list if specified as null', () => {
                // when querying/filtering, null is interpreted as [] anyway, so avoid having a mix of both in the db
                const prepared = inputType.prepareValue({ movies: null }, context);
                expect(prepared.movies).to.deep.equal([]);
            });

            it('does not include it if not specified', () => {
                // when querying/filtering, null is interpreted as [] anyway, so avoid having a mix of both in the db
                const prepared = inputType.prepareValue({}, context);
                expect(prepared.movies).to.be.undefined;
            });
        });

        describe('getAffectedFields()', () => {
            it('includes it and its inner fields if specified', () => {
                const fields = inputType.getAffectedFields({ movies }, context);
                expect(fields).to.deep.equal([type.getFieldOrThrow('movies'), movieType.getFieldOrThrow('name')]);
            });

            it('includes it if specified null', () => {
                const fields = inputType.getAffectedFields({ movies: null }, context);
                expect(fields).to.deep.equal([type.getFieldOrThrow('movies')]);
            });

            it('does not include it if not specified', () => {
                const fields = inputType.getAffectedFields({}, context);
                expect(fields).be.empty;
            });
        });
    });

    describe('with entity extension fields', () => {
        const model = new Model({
            types: [
                {
                    kind: TypeKind.ENTITY_EXTENSION,
                    name: 'Suit',
                    fields: [
                        {
                            name: 'color',
                            typeName: 'String'
                        }
                    ]
                }
            ]
        });
        const type = new RootEntityType(
            {
                kind: TypeKind.ROOT_ENTITY,
                name: 'Hero',
                fields: [
                    {
                        name: 'suit',
                        typeName: 'Suit'
                    }
                ]
            },
            model
        );
        const suitType = model.getEntityExtensionTypeOrThrow('Suit');
        const inputType = generator.generate(type);

        describe('input field', () => {
            const field = inputType.getInputType().getFields()['suit'];

            it('exists', () => {
                expect(field).not.to.be.undefined;
            });

            it('has correct type', () => {
                expect(field.type).to.be.an.instanceOf(GraphQLInputObjectType);
                expect((field.type as GraphQLInputObjectType).getFields().color).not.to.be.undefined;
            });
        });

        describe('prepare()', () => {
            it('includes it if specified', () => {
                const prepared = inputType.prepareValue({ suit: { color: 'black' } }, context) as any;
                expect(prepared.suit).to.deep.equal({ color: 'black' });
            });

            it('defaults to {} on null value', () => {
                const prepared = inputType.prepareValue({ suit: null }, context) as any;
                expect(prepared.suit).to.deep.equal({});
            });

            it('defaults to {} if not specified', () => {
                const prepared = inputType.prepareValue({}, context);
                expect(prepared.suit).to.deep.equal({});
            });
        });

        describe('getAffectedFields()', () => {
            it('includes it and its inner fields if specified', () => {
                const fields = inputType.getAffectedFields({ suit: { color: 'black' } }, context);
                expect(fields).to.deep.equal([type.getFieldOrThrow('suit'), suitType.getFieldOrThrow('color')]);
            });

            it('includes it if specified null', () => {
                const fields = inputType.getAffectedFields({ suit: null }, context);
                expect(fields).to.deep.equal([type.getFieldOrThrow('suit')]);
            });

            it('does not include it if not specified', () => {
                const fields = inputType.getAffectedFields({}, context);
                expect(fields).be.empty;
            });
        });
    });

    describe('with reference fields', () => {
        const model = new Model({
            types: [
                {
                    kind: TypeKind.ROOT_ENTITY,
                    name: 'Country',
                    keyFieldName: 'isoCode',
                    fields: [
                        {
                            name: 'isoCode',
                            typeName: 'String'
                        }
                    ]
                }
            ]
        });

        const type = new RootEntityType(
            {
                kind: TypeKind.ROOT_ENTITY,
                name: 'Hero',
                fields: [
                    {
                        name: 'country',
                        typeName: 'Country',
                        isReference: true
                    }
                ]
            },
            model
        );
        const inputType = generator.generate(type);

        it('includes it in the input type', () => {
            expect(inputType.getInputType().getFields()['country'].type).to.equal(GraphQLString);
        });

        describe('prepare()', () => {
            it('includes it if specified', () => {
                const prepared = inputType.prepareValue({ country: 'US' }, context);
                expect(prepared.country).to.equal('US');
            });

            it('includes it if set to null', () => {
                // mimic the update case where setting to null does not remove the property but sets it to null
                const prepared = inputType.prepareValue({ country: null }, context);
                expect(prepared.country).to.be.null;
            });

            it('does not include it it if not specified', () => {
                const prepared = inputType.prepareValue({}, context);
                expect(prepared.country).to.be.undefined;
            });
        });

        describe('getAffectedFields()', () => {
            it('includes it if specified', () => {
                const fields = inputType.getAffectedFields({ country: 'US' }, context);
                expect(fields).to.deep.equal([type.getFieldOrThrow('country')]);
            });

            it('includes it if specified as null', () => {
                const fields = inputType.getAffectedFields({ country: null }, context);
                expect(fields).to.deep.equal([type.getFieldOrThrow('country')]);
            });

            it('does not include it if not specified', () => {
                const fields = inputType.getAffectedFields({}, context);
                expect(fields).be.empty;
            });
        });
    });

    describe('for root entities', () => {
        const type = new RootEntityType(
            {
                kind: TypeKind.ROOT_ENTITY,
                name: 'Hero',
                fields: [
                    {
                        name: 'name',
                        typeName: 'String',
                        defaultValue: 'Batman'
                    }
                ]
            },
            model
        );
        const inputType = generator.generate(type);

        describe('input type', () => {
            it('does not include createdAt or updatedAt', () => {
                expect(inputType.getInputType().getFields().createdAt).to.be.undefined;
                expect(inputType.getInputType().getFields().updatedAt).to.be.undefined;
            });
        });

        describe('prepare()', () => {
            it('includes createdAt and updatedAt', () => {
                const prepared = inputType.prepareValue({}, context);
                expect(prepared.updatedAt).to.be.a('string');
                expect(prepared.createdAt).to.be.a('string');
            });

            it('does not include id', () => {
                // id is generated by database adapter
                const prepared = inputType.prepareValue({}, context);
                expect(prepared.id).to.be.undefined;
            });
        });
    });

    describe('for child entities', () => {
        const type = new ChildEntityType(
            {
                kind: TypeKind.CHILD_ENTITY,
                name: 'Hero',
                fields: [
                    {
                        name: 'name',
                        typeName: 'String',
                        defaultValue: 'Batman'
                    }
                ]
            },
            model
        );
        const inputType = generator.generate(type);

        describe('prepare()', () => {
            it('includes createdAt, updatedAt and id', () => {
                const prepared = inputType.prepareValue({}, context);
                expect(prepared.updatedAt).to.be.a('string');
                expect(prepared.createdAt).to.be.a('string');
                expect(prepared.id).to.be.a('string');
            });
        });

        describe('input type', () => {
            it('does not include id, createdAt, or updatedAt', () => {
                expect(inputType.getInputType().getFields().id).to.be.undefined;
                expect(inputType.getInputType().getFields().createdAt).to.be.undefined;
                expect(inputType.getInputType().getFields().updatedAt).to.be.undefined;
            });
        });
    });

    describe('with recursive types', () => {
        const model = new Model({
            types: [
                {
                    kind: TypeKind.VALUE_OBJECT,
                    name: 'Node',
                    fields: [
                        {
                            name: 'parent',
                            typeName: 'Node'
                        }
                    ]
                }
            ]
        });

        it('does not enter an infinite loop on creation', () => {
            generator.generate(model.getValueObjectTypeOrThrow('Node'));
        });

        it('creates a cyclic object structure', () => {
            const inputType = generator.generate(model.getValueObjectTypeOrThrow('Node'));
            const parentField = inputType.fields.find(f => f.name == 'parent');
            expect((parentField as CreateObjectInputField).objectInputType).to.equal(inputType);
        });

        it('creates a cyclic graphql input type structure', () => {
            const inputType = generator.generate(model.getValueObjectTypeOrThrow('Node'));
            const graphqlType = inputType.getInputType();
            const parentField = graphqlType.getFields().parent;
            expect(parentField.type).to.equal(graphqlType);
        });
    });
});
