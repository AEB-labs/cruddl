import { describe, it } from 'vitest';
import {
    assertValidatorAcceptsAndDoesNotWarn,
    assertValidatorRejects,
} from '../utils/source-validation-utils.js';

describe('known field directive validator', () => {
    it('rejects unknown field directives', () => {
        assertValidatorRejects(
            `
            type Stuff @rootEntity {
                foo: String @unknown
            }
        `,
            'Unknown directive "@unknown".',
        );
    });

    it('accepts known field directives', () => {
        assertValidatorAcceptsAndDoesNotWarn(`
            type Stuff @rootEntity {
                foo: String @key
            }
        `);
    });

    it('accepts fields without directives', () => {
        assertValidatorAcceptsAndDoesNotWarn(`
            type Stuff @rootEntity {
                foo: String
            }
        `);
    });
});
