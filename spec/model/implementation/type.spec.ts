import { GraphQLString } from 'graphql';
import { Model, ScalarType, TypeKind } from '../../../src/model';
import { expectSingleErrorToInclude, expectSingleWarningToInclude, expectToBeValid } from './validation-utils';

// This test uses a ScalarType because that is a concrete class without much addition to TypeBase
describe('Type', () => {
    describe('with name', () => {
        const model = new Model({ types: [] });

        it('accepts simple type', () => {
            const type = new ScalarType(
                {
                    kind: TypeKind.SCALAR,
                    name: 'Delivery',
                    graphQLScalarType: GraphQLString
                },
                model
            );

            expectToBeValid(type);
        });

        it('rejects type without name', () => {
            const type = new ScalarType(
                {
                    kind: TypeKind.SCALAR,
                    name: '',
                    graphQLScalarType: GraphQLString
                },
                model
            );

            expectSingleErrorToInclude(type, `Type name is empty.`);
        });

        it('warns about type names containing underscores', () => {
            const type = new ScalarType(
                {
                    kind: TypeKind.SCALAR,
                    name: 'This_Is_Ugly',
                    graphQLScalarType: GraphQLString
                },
                model
            );

            expectSingleWarningToInclude(type, `Type names should not include underscores.`);
        });

        it('rejects names starting with an underscore', () => {
            const type = new ScalarType(
                {
                    kind: TypeKind.SCALAR,
                    name: '_Internal',
                    graphQLScalarType: GraphQLString
                },
                model
            );
            expectSingleErrorToInclude(type, `Type names cannot start with an underscore.`);
        });

        it('warns about type names starting with a lowercase character', () => {
            const type = new ScalarType(
                {
                    kind: TypeKind.SCALAR,
                    name: 'thisIsNotATypeName',
                    graphQLScalarType: GraphQLString
                },
                model
            );

            expectSingleWarningToInclude(type, `Type names should start with an uppercase character.`);
        });
    });
});
