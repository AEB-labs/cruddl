import { assertValidatorAcceptsAndDoesNotWarn, assertValidatorRejects } from './helpers';

describe('relations only in root entities validator', () => {
    it('rejects @relation in non-@rootEntity', () => {
        assertValidatorRejects(
            `
            type Stuff @rootEntity {
                foo: String
            }
            type Bar @childEntity {
                stuff: [Stuff] @relation
            }
        `,
            'Relations can only be defined on root entity types. Consider using @reference instead.',
        );
    });

    it('accepts @relation in @rootEntity', () => {
        assertValidatorAcceptsAndDoesNotWarn(`
            type Stuff @rootEntity {
                foo: String
            }
            type Bar @rootEntity {
                stuff: [Stuff] @relation
            }
        `);
    });
});
