import { assertValidatorWarns } from './helpers';

describe('flexSearch', () => {
    describe('flexSearchSort', () => {
        it('warns about missing field', () => {
            assertValidatorWarns(
                `
                type Root @rootEntity(flexSearch: true, flexSearchOrder: [ { field: "nonExistant", direction: ASC } ]) {
                    name: String
                }
            `,
                'The provided flexSearchOrder is invalid. It must be a path that evaluates to a scalar value and the full path must be annotated with flexSearch.'
            );
        });
    });
});
