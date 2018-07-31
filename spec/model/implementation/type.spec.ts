import { GraphQLString } from 'graphql';
import { Model, ScalarType, TypeKind } from '../../../src/model';
import { expectSingleErrorToInclude, expectSingleWarningToInclude, expectToBeValid } from './validation-utils';

// This test uses a ScalarType because that is a concrete class without much addition to TypeBase
describe('Type', () => {
    describe('with name', () => {
        const model = new Model({types:[]});

        it('accepts simple type', () => {
            const type = new ScalarType({
                kind: TypeKind.SCALAR,
                name: 'Delivery'
            }, model, GraphQLString);

            expectToBeValid(type);
        });

        it('rejects type without name', () => {
            const type = new ScalarType({
                kind: TypeKind.SCALAR,
                name: ''
            }, model, GraphQLString);

            expectSingleErrorToInclude(type, `Type name is empty.`);
        });

        it('warns about type names containing underscores', () => {
            const type = new ScalarType({
                kind: TypeKind.SCALAR,
                name: 'This_Is_Ugly'
            }, model, GraphQLString);

            expectSingleWarningToInclude(type, `Type names should not include underscores.`);
        });

        it('rejects names starting with an underscore', () => {
            const type = new ScalarType({
                kind: TypeKind.SCALAR,
                name: '_Internal'
            }, model, GraphQLString);
            expectSingleErrorToInclude(type, `Type names cannot start with an underscore.`);
        });

        it('warns about type names starting with a lowercase character', () => {
            const type = new ScalarType({
                kind: TypeKind.SCALAR,
                name: 'thisIsNotATypeName'
            }, model, GraphQLString);

            expectSingleWarningToInclude(type, `Type names should start with an uppercase character.`);
        });
    });
});
