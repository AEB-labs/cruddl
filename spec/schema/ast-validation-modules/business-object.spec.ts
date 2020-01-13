import { print } from 'graphql';
import gql from 'graphql-tag';
import { assertValidatorAccepts, assertValidatorRejects } from './helpers';

describe('@businessObject validation', () => {
    it('is invalid on entity extension types', () => {
        assertValidatorRejects(
            print(gql`
                type Root @rootEntity {
                    ext: Test
                }

                type Test @entityExtension @businessObject {
                    a: String
                }
            `),
            'The directive @businessObject can only be used on root entity type definitions.'
        );
    });

    it('is valid on root entity types', () => {
        assertValidatorAccepts(
            print(gql`
                type Test @rootEntity @businessObject {
                    a: String
                }
            `)
        );
    });
});
