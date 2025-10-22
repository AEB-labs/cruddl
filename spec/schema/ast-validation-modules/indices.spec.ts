import gql from 'graphql-tag';
import { assertValidatorAcceptsAndDoesNotWarn, assertValidatorRejects } from './helpers';
import { prettyPrint } from '../../../src/graphql/pretty-print';

describe('index validations', () => {
    it('accepts simple indices on root entities', () => {
        assertValidatorAcceptsAndDoesNotWarn(
            prettyPrint(gql`
                type Root @rootEntity(indices: [{ fields: ["dummy"] }]) {
                    dummy: String
                }
            `),
        );
    });

    it('accepts indices with one list on root entities', () => {
        assertValidatorAcceptsAndDoesNotWarn(
            prettyPrint(gql`
                type Root @rootEntity(indices: [{ fields: ["objects.name"] }]) {
                    objects: [Object]
                }

                type Object @valueObject {
                    name: String
                }
            `),
        );
    });

    it('errors on indices with two lists on root entities', () => {
        assertValidatorRejects(
            prettyPrint(gql`
                type Root @rootEntity(indices: [{ fields: ["objects.children.name"] }]) {
                    objects: [Object]
                }

                type Object @valueObject {
                    children: [Object]
                    name: String
                }
            `),
            'Index paths with more than one list field are not supported by ArangoDB (list fields: "Root.objects", "Object.children").',
        );
    });
});
