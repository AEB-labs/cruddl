import { describe, expect, it } from 'vitest';
import {
    applyQuickFix,
    assertValidatorAcceptsAndDoesNotWarn,
    assertValidatorWarns,
    validate,
} from '../utils/source-validation-utils.js';

describe('@defaultValue', () => {
    describe('on scalar fields', () => {
        it('accepts valid values for all scalar types', () => {
            assertValidatorAcceptsAndDoesNotWarn(`
                type Test @rootEntity {
                    string: String @defaultValue(value: "abc")
                    identifier: ID @defaultValue(value: "abc")
                    int: Int @defaultValue(value: 42)
                    int53: Int53 @defaultValue(value: 9007199254740991)
                    float: Float @defaultValue(value: 3.14)
                    floatFromInt: Float @defaultValue(value: 3)
                    decimal: Decimal2 @defaultValue(value: 1.23)
                    boolean: Boolean @defaultValue(value: true)
                    dateTime: DateTime @defaultValue(value: "2020-01-01T00:00:00Z")
                    localDate: LocalDate @defaultValue(value: "2020-01-01")
                    localTime: LocalTime @defaultValue(value: "12:30:00")
                    offsetDateTime: OffsetDateTime @defaultValue(value: "2020-01-01T00:00:00+01:00")
                    json: JSON @defaultValue(value: { a: [1, "b", null, FOO] })
                    jsonObject: JSONObject @defaultValue(value: { a: 1 })
                    stringMap: StringMap @defaultValue(value: { a: "b" })
                    i18nString: I18nString @defaultValue(value: { en: "Hello", de: "Hallo" })
                }
            `);
        });

        it('warns about a string for an Int field', () => {
            assertValidatorWarns(
                `
                type Test @rootEntity {
                    int: Int @defaultValue(value: "42")
                }
            `,
                'Default value is not a valid Int: Int cannot represent non-integer value: "42". This will be an error in a future release.',
            );
        });

        it('warns about a float for an Int field', () => {
            assertValidatorWarns(
                `
                type Test @rootEntity {
                    int: Int @defaultValue(value: 1.5)
                }
            `,
                'Default value is not a valid Int: Int cannot represent non-integer value: 1.5. This will be an error in a future release.',
            );
        });

        it('warns about a string for a Boolean field', () => {
            assertValidatorWarns(
                `
                type Test @rootEntity {
                    boolean: Boolean @defaultValue(value: "true")
                }
            `,
                'Default value is not a valid Boolean: Boolean cannot represent a non boolean value: "true". This will be an error in a future release.',
            );
        });

        it('warns about a number for a String field', () => {
            assertValidatorWarns(
                `
                type Test @rootEntity {
                    string: String @defaultValue(value: 42)
                }
            `,
                'Default value is not a valid String: String cannot represent a non string value: 42. This will be an error in a future release.',
            );
        });

        it('warns about an invalid DateTime', () => {
            assertValidatorWarns(
                `
                type Test @rootEntity {
                    dateTime: DateTime @defaultValue(value: "2020-01-01")
                }
            `,
                'Default value is not a valid DateTime: Invalid ISO 8601 DateTime: 2020-01-01. This will be an error in a future release.',
            );
        });

        it('warns about an invalid LocalDate', () => {
            assertValidatorWarns(
                `
                type Test @rootEntity {
                    localDate: LocalDate @defaultValue(value: "2020-13-01")
                }
            `,
                'Default value is not a valid LocalDate: Invalid ISO 8601 LocalDate: 2020-13-01. This will be an error in a future release.',
            );
        });

        it('warns about an OffsetDateTime without offset', () => {
            assertValidatorWarns(
                `
                type Test @rootEntity {
                    offsetDateTime: OffsetDateTime @defaultValue(value: "2020-01-01T00:00:00")
                }
            `,
                'Default value is not a valid OffsetDateTime: OffsetDateTime is missing timezone offset: 2020-01-01T00:00:00. This will be an error in a future release.',
            );
        });

        it('warns about a Decimal that is too large', () => {
            assertValidatorWarns(
                `
                type Test @rootEntity {
                    decimal: Decimal2 @defaultValue(value: 2000000000)
                }
            `,
                'Default value is not a valid Decimal2: Decimal2 cannot represent value larger than 1000000000.00: 2000000000. This will be an error in a future release.',
            );
        });

        it('warns about a non-object for a JSONObject field', () => {
            assertValidatorWarns(
                `
                type Test @rootEntity {
                    jsonObject: JSONObject @defaultValue(value: [1])
                }
            `,
                'Default value is not a valid JSONObject: JSONObject cannot represent non-object value: 1. This will be an error in a future release.',
            );
        });
    });

    describe('on enum fields', () => {
        it('accepts an enum literal and a string', () => {
            assertValidatorAcceptsAndDoesNotWarn(`
                enum Status { DRAFT, DONE }
                type Test @rootEntity {
                    status: Status @defaultValue(value: DRAFT)
                    status2: Status @defaultValue(value: "DONE")
                }
            `);
        });

        it('warns about an unknown value', () => {
            assertValidatorWarns(
                `
                enum Status { DRAFT, DONE }
                type Test @rootEntity {
                    status: Status @defaultValue(value: OPEN)
                }
            `,
                'Default value must be a value of enum "Status", but is "OPEN". Valid values: DRAFT, DONE. This will be an error in a future release.',
            );
        });

        it('warns about a non-string value', () => {
            assertValidatorWarns(
                `
                enum Status { DRAFT, DONE }
                type Test @rootEntity {
                    status: Status @defaultValue(value: 1)
                }
            `,
                'Default value must be a value of enum "Status", but is 1. Valid values: DRAFT, DONE. This will be an error in a future release.',
            );
        });
    });

    describe('on list fields', () => {
        it('accepts a list', () => {
            assertValidatorAcceptsAndDoesNotWarn(`
                type Test @rootEntity {
                    strings: [String] @defaultValue(value: ["a", "b"])
                    empty: [Int] @defaultValue(value: [])
                }
            `);
        });

        it('warns about a single value', () => {
            assertValidatorWarns(
                `
                type Test @rootEntity {
                    strings: [String] @defaultValue(value: "a")
                }
            `,
                'Default value must be a list because "Test.strings" is a list field. This will be an error in a future release.',
            );
        });

        it('warns about an item of the wrong type', () => {
            assertValidatorWarns(
                `
                type Test @rootEntity {
                    ints: [Int] @defaultValue(value: [1, "2"])
                }
            `,
                'Default value at "[1]" is not a valid Int: Int cannot represent non-integer value: "2". This will be an error in a future release.',
            );
        });

        it('warns about null items', () => {
            assertValidatorWarns(
                `
                type Test @rootEntity {
                    ints: [Int] @defaultValue(value: [1, null])
                }
            `,
                'Default value at "[1]" must not be null. This will be an error in a future release.',
            );
        });
    });

    describe('on object fields', () => {
        it('accepts valid values for value objects, entity extensions and child entities', () => {
            assertValidatorAcceptsAndDoesNotWarn(`
                type Test @rootEntity {
                    address: Address @defaultValue(value: { street: "Main St", zipCode: "12345", tags: ["a"] })
                    extension: Extension @defaultValue(value: { count: 1, address: { street: "Main St" } })
                    children: [Child] @defaultValue(value: [{ name: "a" }, { name: "b", amount: 1.5 }])
                }

                type Address @valueObject {
                    street: String
                    zipCode: String
                    tags: [String]
                }

                type Extension @entityExtension {
                    count: Int
                    address: Address
                }

                type Child @childEntity {
                    name: String
                    amount: Decimal1
                }
            `);
        });

        it('warns about a non-object', () => {
            assertValidatorWarns(
                `
                type Test @rootEntity {
                    address: Address @defaultValue(value: "Main St")
                }

                type Address @valueObject {
                    street: String
                }
            `,
                'Default value must be an object of type "Address", but is "Main St". This will be an error in a future release.',
            );
        });

        it('warns about an unknown field', () => {
            assertValidatorWarns(
                `
                type Test @rootEntity {
                    address: Address @defaultValue(value: { street: "Main St", city: "Springfield" })
                }

                type Address @valueObject {
                    street: String
                }
            `,
                'Default value: field "city" does not exist on type "Address". This will be an error in a future release.',
            );
        });

        it('warns about a nested value of the wrong type', () => {
            assertValidatorWarns(
                `
                type Test @rootEntity {
                    extension: Extension @defaultValue(value: { address: { zipCode: 12345 } })
                }

                type Extension @entityExtension {
                    address: Address
                }

                type Address @valueObject {
                    zipCode: String
                }
            `,
                'Default value at "address.zipCode" is not a valid String: String cannot represent a non string value: 12345. This will be an error in a future release.',
            );
        });

        it('warns about an invalid value within a child entity list', () => {
            assertValidatorWarns(
                `
                type Test @rootEntity {
                    children: [Child] @defaultValue(value: [{ name: "a" }, { amount: "1" }])
                }

                type Child @childEntity {
                    name: String
                    amount: Int
                }
            `,
                'Default value at "[1].amount" is not a valid Int: Int cannot represent non-integer value: "1". This will be an error in a future release.',
            );
        });

        it('warns about system fields of child entities', () => {
            assertValidatorWarns(
                `
                type Test @rootEntity {
                    children: [Child] @defaultValue(value: [{ id: "abc", name: "a" }])
                }

                type Child @childEntity {
                    name: String
                }
            `,
                'Default value at "[0]": field "id" cannot be set because it is a system field. This will be an error in a future release.',
            );
        });

        it('checks references against the key field type', () => {
            assertValidatorWarns(
                `
                type Test @rootEntity {
                    address: Address @defaultValue(value: { country: 49 })
                }

                type Address @valueObject {
                    country: Country @reference @suppress(warnings: DEPRECATED_REFERENCE)
                }

                type Country @rootEntity {
                    isoCode: String @key
                }
            `,
                'Default value at "country" is not a valid String: String cannot represent a non string value: 49. This will be an error in a future release.',
            );
        });

        it('accepts references with a key field', () => {
            assertValidatorAcceptsAndDoesNotWarn(`
                type Test @rootEntity {
                    address: Address @defaultValue(value: { countryCode: "DE" })
                }

                type Address @valueObject {
                    countryCode: String
                    country: Country @reference(keyField: "countryCode")
                }

                type Country @rootEntity {
                    isoCode: String @key
                }
            `);
        });

        it('warns about setting both a reference and its key field', () => {
            assertValidatorWarns(
                `
                type Test @rootEntity {
                    address: Address @defaultValue(value: { countryCode: "DE", country: "FR" })
                }

                type Address @valueObject {
                    countryCode: String
                    country: Country @reference(keyField: "countryCode")
                }

                type Country @rootEntity {
                    isoCode: String @key
                }
            `,
                'Default value: cannot set both "countryCode" and "country" because they refer to the same reference. This will be an error in a future release.',
            );
        });

        it('reports all errors', () => {
            assertValidatorWarns(
                `
                type Test @rootEntity {
                    address: Address @defaultValue(value: { street: 1, zipCode: 2 })
                }

                type Address @valueObject {
                    street: String
                    zipCode: String
                }
            `,
                [
                    'Default value at "street" is not a valid String: String cannot represent a non string value: 1. This will be an error in a future release.',
                    'Default value at "zipCode" is not a valid String: String cannot represent a non string value: 2. This will be an error in a future release.',
                ],
            );
        });
    });

    describe('quick fixes', () => {
        function expectQuickFix(source: string, description: string, expectedSource: string) {
            const newSource = applyQuickFix(validate(source).messages, description);
            expect(newSource).to.equal(expectedSource);
            assertValidatorAcceptsAndDoesNotWarn(newSource);
        }

        it('suggests similar enum values', () => {
            const source = `
                enum Status { DRAFT, DONE }
                type Test @rootEntity {
                    status: Status @defaultValue(value: Draft)
                }
            `;
            expectQuickFix(source, 'Change to "DRAFT"', source.replace('Draft', 'DRAFT'));
        });

        it('removes null list items', () => {
            const source = `
                type Test @rootEntity {
                    tags: [String] @defaultValue(value: ["a", null])
                }
            `;
            expectQuickFix(source, 'Remove the null value', source.replace(', null', ''));
        });

        it('suggests similar field names', () => {
            const source = `
                type Test @rootEntity {
                    address: Address @defaultValue(value: { stret: "Main St" })
                }

                type Address @valueObject {
                    street: String
                }
            `;
            expectQuickFix(source, 'Change to "street"', source.replace('stret', 'street'));
        });

        it('offers to suppress the warning', () => {
            const source = `
                type Test @rootEntity {
                    count: Int @defaultValue(value: "1.5")
                }
            `;
            const newSource = applyQuickFix(validate(source).messages, 'Suppress this warning');
            assertValidatorAcceptsAndDoesNotWarn(newSource);
        });
    });
});
