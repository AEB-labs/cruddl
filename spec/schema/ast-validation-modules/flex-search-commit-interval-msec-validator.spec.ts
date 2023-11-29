import { assertValidatorAcceptsAndDoesNotWarn, assertValidatorRejects } from './helpers';

describe('flexSearchPerformanceParams in @rootEntity', () => {
    it('accepts omitting it', () => {
        assertValidatorAcceptsAndDoesNotWarn(`
            type Stuff @rootEntity(
                flexSearch: true
            ) {
                foo: String @flexSearch
            }
        `);
    });
    it('accepts it empty', () => {
        assertValidatorAcceptsAndDoesNotWarn(`
            type Stuff @rootEntity(
                flexSearch: true
                flexSearchPerformanceParams: {}
            ) {
                foo: String @flexSearch
            }
        `);
    });

    describe('commitIntervalMsec', () => {
        it('accepts it  being null', () => {
            assertValidatorAcceptsAndDoesNotWarn(`
                type Stuff @rootEntity(
                    flexSearch: true
                    flexSearchPerformanceParams: {
                        commitIntervalMsec: null
                    }
                ) {
                    foo: String @flexSearch
                }
            `);
        });

        it('accepts 100', () => {
            assertValidatorAcceptsAndDoesNotWarn(`
                type Stuff @rootEntity(
                    flexSearch: true
                    flexSearchPerformanceParams: {
                        commitIntervalMsec: 100
                    } 
                ) {
                    foo: String @flexSearch
                }
            `);
        });

        it('accepts 5000', () => {
            assertValidatorAcceptsAndDoesNotWarn(`
                type Stuff @rootEntity(
                    flexSearch: true
                    flexSearchPerformanceParams: {
                        commitIntervalMsec: 5000 
                    }
                ) {
                    foo: String @flexSearch
                }
            `);
        });

        it('rejects 50', () => {
            assertValidatorRejects(
                `
                type Stuff @rootEntity(
                    flexSearch: true
                    flexSearchPerformanceParams: {
                        commitIntervalMsec: 50 
                    }
                ) {
                    foo: String @flexSearch
                }
            `,
                'Cannot be less than 100.',
            );
        });

        it('rejects -1', () => {
            assertValidatorRejects(
                `
                type Stuff @rootEntity(
                    flexSearch: true
                    flexSearchPerformanceParams: {
                        commitIntervalMsec: -1 
                    }
                ) {
                    foo: String @flexSearch
                }
            `,
                'Cannot be less than 100.',
            );
        });

        it('rejects 123.4', () => {
            assertValidatorRejects(
                `
                type Stuff @rootEntity(
                    flexSearch: true
                    flexSearchPerformanceParams: {
                        commitIntervalMsec: 123.4 
                    }
                ) {
                    foo: String @flexSearch
                }
            `,
                'Int cannot represent non-integer value: 123.4',
            );
        });
    });

    describe('consolidationIntervalMsec', () => {
        it('accepts it being null', () => {
            assertValidatorAcceptsAndDoesNotWarn(`
                type Stuff @rootEntity(
                    flexSearch: true
                    flexSearchPerformanceParams: {
                        consolidationIntervalMsec: null
                    }
                ) {
                    foo: String @flexSearch
                }
            `);
        });

        it('accepts 100', () => {
            assertValidatorAcceptsAndDoesNotWarn(`
                type Stuff @rootEntity(
                    flexSearch: true
                    flexSearchPerformanceParams: {
                        consolidationIntervalMsec: 100
                    } 
                ) {
                    foo: String @flexSearch
                }
            `);
        });

        it('accepts 5000', () => {
            assertValidatorAcceptsAndDoesNotWarn(`
                type Stuff @rootEntity(
                    flexSearch: true
                    flexSearchPerformanceParams: {
                        consolidationIntervalMsec: 5000 
                    }
                ) {
                    foo: String @flexSearch
                }
            `);
        });

        it('rejects 50', () => {
            assertValidatorRejects(
                `
                type Stuff @rootEntity(
                    flexSearch: true
                    flexSearchPerformanceParams: {
                        consolidationIntervalMsec: 50 
                    }
                ) {
                    foo: String @flexSearch
                }
            `,
                'Cannot be less than 100.',
            );
        });

        it('rejects -1', () => {
            assertValidatorRejects(
                `
                type Stuff @rootEntity(
                    flexSearch: true
                    flexSearchPerformanceParams: {
                        consolidationIntervalMsec: -1 
                    }
                ) {
                    foo: String @flexSearch
                }
            `,
                'Cannot be less than 100.',
            );
        });

        it('rejects 123.4', () => {
            assertValidatorRejects(
                `
                type Stuff @rootEntity(
                    flexSearch: true
                    flexSearchPerformanceParams: {
                        consolidationIntervalMsec: 123.4 
                    }
                ) {
                    foo: String @flexSearch
                }
            `,
                'Int cannot represent non-integer value: 123.4',
            );
        });
    });

    describe('cleanupIntervalStep', () => {
        it('accepts it being null', () => {
            assertValidatorAcceptsAndDoesNotWarn(`
                type Stuff @rootEntity(
                    flexSearch: true
                    flexSearchPerformanceParams: {
                        cleanupIntervalStep: null
                    }
                ) {
                    foo: String @flexSearch
                }
            `);
        });

        it('accepts 0', () => {
            assertValidatorAcceptsAndDoesNotWarn(`
                type Stuff @rootEntity(
                    flexSearch: true
                    flexSearchPerformanceParams: {
                        cleanupIntervalStep: 0
                    } 
                ) {
                    foo: String @flexSearch
                }
            `);
        });

        it('accepts 5', () => {
            assertValidatorAcceptsAndDoesNotWarn(`
                type Stuff @rootEntity(
                    flexSearch: true
                    flexSearchPerformanceParams: {
                        cleanupIntervalStep: 5 
                    }
                ) {
                    foo: String @flexSearch
                }
            `);
        });

        it('rejects -1', () => {
            assertValidatorRejects(
                `
                type Stuff @rootEntity(
                    flexSearch: true
                    flexSearchPerformanceParams: {
                        cleanupIntervalStep: -1 
                    }
                ) {
                    foo: String @flexSearch
                }
            `,
                'Cannot be negative.',
            );
        });

        it('rejects 123.4', () => {
            assertValidatorRejects(
                `
                type Stuff @rootEntity(
                    flexSearch: true
                    flexSearchPerformanceParams: {
                        cleanupIntervalStep: 123.4 
                    }
                ) {
                    foo: String @flexSearch
                }
            `,
                'Int cannot represent non-integer value: 123.4',
            );
        });
    });
});
