import { ScalarType, TypeKind } from '../../../src/model';
import { expectSingleErrorToInclude, expectSingleWarningToInclude, expectToBeValid } from './validation-utils';

// This test uses a ScalarType because that is a concrete class without much addition to TypeBase
describe('Type', () => {
    describe('with name', () => {
        it('accepts simple type', () => {
            const type = new ScalarType({
                kind: TypeKind.SCALAR,
                name: 'Delivery'
            });

            expectToBeValid(type);
        });

        it('rejects type without name', () => {
            const type = new ScalarType({
                kind: TypeKind.SCALAR,
                name: ''
            });

            expectSingleErrorToInclude(type, `Type name is empty.`);
        });

        it('rejects type with name containing underscores', () => {
            const type = new ScalarType({
                kind: TypeKind.SCALAR,
                name: 'This_Is_Ugly'
            });

            expectSingleErrorToInclude(type, `Type names should only contain alphanumeric characters.`);
        });

        it('warns about type names starting with a lowercase character', () => {
            const type = new ScalarType({
                kind: TypeKind.SCALAR,
                name: 'thisIsNotATypeName'
            });

            expectSingleWarningToInclude(type, `Type names should start with an uppercase character.`);
        });
    });
});