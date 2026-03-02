import { gql } from 'graphql-tag';
import { describe, it } from 'vitest';
import { prettyPrint } from '../../../src/graphql/pretty-print.js';
import { assertValidatorAcceptsAndDoesNotWarn, assertValidatorRejects } from './helpers.js';

describe('@businessObject validation', () => {
    it('is invalid on entity extension types', () => {
        assertValidatorRejects(
            prettyPrint(gql`
                type Root @rootEntity {
                    ext: Test
                }

                type Test @entityExtension @businessObject {
                    a: String
                }
            `),
            'The directive @businessObject can only be used on root entity type definitions.',
        );
    });

    it('is valid on root entity types', () => {
        assertValidatorAcceptsAndDoesNotWarn(
            prettyPrint(gql`
                type Test @rootEntity @businessObject {
                    a: String
                }
            `),
        );
    });
});
