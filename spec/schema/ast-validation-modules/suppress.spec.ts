import { assertValidatorAcceptsAndDoesNotWarn, assertValidatorWarns } from './helpers';

describe('@suppress', () => {
    it('warns on type level if @suppress is not used', () => {
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

    it('does not warn on type level if @suppress is used correctly with one entry', () => {
        assertValidatorAcceptsAndDoesNotWarn(
            `
            type Stuff @rootEntity {
                foo: String
            }
            type Child @childEntity @suppress(warnings: [UNUSED]) {
                stuff: Int
            }
        `,
        );
    });

    it('does not warn on type level if @suppress is used correctly with one non-list entry', () => {
        assertValidatorAcceptsAndDoesNotWarn(
            `
            type Stuff @rootEntity {
                foo: String
            }
            type Child @childEntity @suppress(warnings: UNUSED) {
                stuff: Int
            }
        `,
        );
    });

    it('does not warn on type level if @suppress is used correctly with multiple entries', () => {
        assertValidatorAcceptsAndDoesNotWarn(
            `
            type Stuff @rootEntity {
                foo: String
            }
            type Child @childEntity @suppress(warnings: [DEPRECATED, UNUSED]) {
                stuff: Int
            }
        `,
        );
    });

    it('warns on type level if @suppress is used with the wrong code entries', () => {
        assertValidatorWarns(
            `
            type Stuff @rootEntity {
                foo: String
            }
            type Child @childEntity @suppress(warnings: [DEPRECATED]) {
                stuff: Int
            }
        `,
            'Type "Child" is not used.',
        );
    });

    it('warns on field level if @suppress is not used', () => {
        assertValidatorWarns(
            `
            type Stuff @rootEntity {
                foo: String
                _key: ID @key
            }
        `,
            'The field "_key" is deprecated and should be replaced with "id" (of type "ID").',
        );
    });

    it('does not warn on field level if @suppress is used', () => {
        assertValidatorAcceptsAndDoesNotWarn(
            `
            type Stuff @rootEntity {
                foo: String
                _key: ID @key @suppress(warnings: [DEPRECATED])
            }
        `,
        );
    });
});
