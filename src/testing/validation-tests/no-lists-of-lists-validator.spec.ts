import { describe, it } from 'vitest';
import {
    assertValidatorAcceptsAndDoesNotWarn,
    assertValidatorRejects,
} from '../utils/source-validation-utils.js';

describe('no lists of lists validator', () => {
    it('rejects lists of lists', () => {
        assertValidatorRejects(
            `
            type Stuff @rootEntity {
                foo: [[String]]
            }
        `,
            'Lists of lists are not allowed.',
        );
    });

    it('rejects non-nullable lists of non-nullable lists of non-nullable elements', () => {
        assertValidatorRejects(
            `
            type Stuff @rootEntity {
                foo: [[String!]!]!
            }
        `,
            'Lists of lists are not allowed.',
        );
    });

    it('accepts non-nested lists', () => {
        assertValidatorAcceptsAndDoesNotWarn(`
            type Stuff @rootEntity {
                foo: [String]
            }
        `);
    });
});
