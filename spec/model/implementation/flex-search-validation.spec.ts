import { Model, RootEntityType, TypeKind } from '../../../core-exports';
import { FLEX_SEARCH_INCLUDED_IN_SEARCH_ARGUMENT } from '../../../src/schema/constants';
import { assertValidatorAccepts, assertValidatorRejects } from '../../schema/ast-validation-modules/helpers';
import { expectSingleErrorToInclude } from './validation-utils';

describe('FlexSearch', () => {
    it('rejects flexSearch on relation', () => {
        assertValidatorRejects(
            `
            type HandlingUnit @rootEntity(flexSearch: true) {
                otherHandlingUnit: HandlingUnit @relation @flexSearch 
            }
        `,
            `@flexSearch is not supported on relations.`
        );
    });
    it('rejects flexSearch on reference', () => {
        assertValidatorRejects(
            `
            type HandlingUnit @rootEntity(flexSearch: true) {
                key: String @key
                otherHandlingUnit: HandlingUnit @reference @flexSearch 
            }
        `,
            `@flexSearch is not supported on references.`
        );
    });
    it('rejects flexSearch on collect fields', () => {
        assertValidatorRejects(
            `
            type HandlingUnit @rootEntity(flexSearch: true) {
                someNumbers: [Int]
                someCollection: Int @collect(path: "someNumbers", aggregate: SUM) @flexSearch
            }
        `,
            `@flexSearch is not supported on collect fields.`
        );
    });
    it('rejects flexSearchFulltext on numbers', () => {
        assertValidatorRejects(
            `
            type HandlingUnit @rootEntity(flexSearch: true) {
                someNumbers: [Int] @flexSearchFulltext(language: DE)
            }
        `,
            `@flexSearchFulltext is not supported on type "Int".`
        );
    });
    it('rejects flexSearchFulltext on collect fields', () => {
        assertValidatorRejects(
            `
            type HandlingUnit @rootEntity(flexSearch: true) {
                someStrings: [String]
                someCollection: [String] @collect(path: "someStrings", aggregate: DISTINCT) @flexSearchFulltext(language: DE)
            }
        `,
            `@flexSearch is not supported on collect fields.`
        );
    });
    it('rejects flexSearchFulltext without language', () => {
        assertValidatorRejects(
            `
            type HandlingUnit @rootEntity(flexSearch: true) {
                someString: String @flexSearchFulltext
            }
        `,
            `@flexSearchFulltext requires either a "language" parameter, or a "flexSearchLanguage" must be set in the defining type.`
        );
    });
    it('rejects flexSearch on child without indexed field', () => {
        assertValidatorRejects(
            `
            type HandlingUnit @rootEntity(flexSearch: true) {
                someExtension: HandlingUnitInfo @flexSearch
            }
            type HandlingUnitInfo @entityExtension{
                someString: String
            }
        `,
            `At least one field on type "HandlingUnitInfo" must be annotated with @flexSearch or @flexSearchFulltext if @flexSearch is specified on the type declaration.`
        );
    });
    it('rejects flexSearch includeInSearch for booleans', () => {
        assertValidatorRejects(
            `
            type HandlingUnit @rootEntity(flexSearch: true) {
                someBool: Boolean @flexSearch(includeInSearch: true)
            }
        `,
            `"${FLEX_SEARCH_INCLUDED_IN_SEARCH_ARGUMENT}: true" is only supported on the types "String", "[String]" and object types.`
        );
    });
    it('accepts flexSearch includeInSearch for string arrays', () => {
        assertValidatorAccepts(`
            type HandlingUnit @rootEntity(flexSearch: true) {
                someListOfStrings: [String] @flexSearch(includeInSearch: true)
            }
        `);
    });
    it('rejects flexSearch without accessField', () => {
        const model = new Model({
            types: [
                {
                    name: 'HandlingUnit',
                    kind: TypeKind.ROOT_ENTITY,
                    fields: [{ name: 'accessGroup', typeName: 'String' }],
                    permissions: {
                        permissionProfileName: 'restricted'
                    },
                    flexSearchIndexConfig: { isIndexed: true, primarySort: [] }
                }
            ],
            permissionProfiles: [
                {
                    namespacePath: [],
                    profiles: {
                        ['restricted']: {
                            permissions: [
                                { access: 'readWrite', roles: ['allusers'], restrictToAccessGroups: ['RESTRICTED'] }
                            ]
                        }
                    }
                }
            ]
        });
        const type = <RootEntityType>model.types.find(value => value.name === 'HandlingUnit');
        expectSingleErrorToInclude(type.fields.find(value => value.name === 'accessGroup')!, '');
    });
    it('accepts a valid primarySort', () => {
        assertValidatorAccepts(`
            type HandlingUnit @rootEntity(flexSearch: true, flexSearchOrder: [{field: "someString", direction: ASC}]) {
                someString: String @flexSearch
            }
        `);
        assertValidatorAccepts(`
            type HandlingUnit @rootEntity(flexSearch: true, flexSearchOrder: [{field: "someExtension.someString", direction: ASC}]) {
                someExtension: HandlingUnitInfo @flexSearch
            }
            type HandlingUnitInfo @entityExtension{
                someString: String @flexSearch
            }
        `);
    });
    it('rejects an invalid primarySort', () => {
        assertValidatorRejects(
            `
            type HandlingUnit @rootEntity(flexSearch: true, flexSearchOrder: [{field: "someTypo", direction: ASC}]) {
                someExtension: HandlingUnitInfo @flexSearch
            }
            type HandlingUnitInfo @entityExtension{
                someString: String
            }
        `,
            `At least one field on type "HandlingUnitInfo" must be annotated with @flexSearch or @flexSearchFulltext if @flexSearch is specified on the type declaration.`
        );
    });
});
