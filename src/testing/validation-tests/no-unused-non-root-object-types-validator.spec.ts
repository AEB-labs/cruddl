import { describe, expect, it } from 'vitest';
import {
    applyQuickFix,
    assertValidatorAcceptsAndDoesNotWarn,
    assertValidatorWarns,
    validate,
} from '../utils/source-validation-utils.js';

describe('unused object validator', () => {
    it('warns about unused objects', () => {
        assertValidatorWarns(
            `
            type Stuff @rootEntity {
                foo: String
            }
            type Child @childEntity {
                stuff: Int
            }
        `,
            'Type "Child" is not used.',
        );
    });

    it('offers to remove unused objects', () => {
        const source = `type Stuff @rootEntity {
    foo: String
}

"A child that is not used anywhere"
type Child @childEntity {
    stuff: Int
}

type Other @rootEntity {
    bar: String
}
`;
        expect(applyQuickFix(validate(source).messages, 'Remove type')).to
            .equal(`type Stuff @rootEntity {
    foo: String
}

type Other @rootEntity {
    bar: String
}
`);
    });

    it('accepts used objects', () => {
        assertValidatorAcceptsAndDoesNotWarn(`
            type Stuff @rootEntity {
                foo: String @key
            }
            type RefStuff @rootEntity {
                stuff: Stuff @reference(keyField: "stuffKey")
                stuffKey: String
            }
        `);
    });
});
