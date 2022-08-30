import { assertValidatorAccepts, assertValidatorRejects } from './helpers';

describe('relations only on root entities validator', () => {
    it('rejects @relation to non-@rootEntity', () => {
        assertValidatorRejects(
            `
            type Stuff @childEntity {
                foo: String
            }
            type Bar @rootEntity {
                stuff: [Stuff] @relation
            }
        `,
            'Type "Stuff" cannot be used with @relation because it is not a root entity type.',
        );
    });

    it('accepts @relation to @rootEntity', () => {
        assertValidatorAccepts(`
            type Stuff @rootEntity {
                foo: String
            }
            type Bar @rootEntity {
                stuff: [Stuff] @relation
            }
        `);
    });
});
