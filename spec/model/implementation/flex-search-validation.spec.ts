import { Model, RootEntityType, TypeKind } from '../../../core-exports';
import { assertValidatorRejects } from '../../schema/ast-validation-modules/helpers';
import { expectSingleErrorToInclude } from './validation-utils';

describe('FlexSearch', () => {
    it('rejects flexSearch on relation', () => {
        assertValidatorRejects(`
            type HandlingUnit @rootEntity(flexSearch: true) {
                otherHandlingUnit: HandlingUnit @relation @flexSearch 
            }
        `, `@flexSearch is not supported on relations.`);
    });
    it('rejects flexSearch on reference', () => {
        assertValidatorRejects(`
            type HandlingUnit @rootEntity(flexSearch: true) {
                key: String @key
                otherHandlingUnit: HandlingUnit @reference @flexSearch 
            }
        `, `@flexSearch is not supported on references.`);
    });
    it('rejects flexSearch on collect fields', () => {
        assertValidatorRejects(`
            type HandlingUnit @rootEntity(flexSearch: true) {
                someNumbers: [Int]
                someCollection: Int @collect(path: "someNumbers", aggregate: SUM) @flexSearch
            }
        `, `@flexSearch is not supported on collect fields.`);
    });
    it('rejects flexSearchFulltext on numbers', () => {
        assertValidatorRejects(`
            type HandlingUnit @rootEntity(flexSearch: true) {
                someNumbers: [Int] @flexSearchFulltext(language: DE)
            }
        `, `@flexSearchFulltext is not supported on type "Int".`);
    });
    it('rejects flexSearchFulltext on collect fields', () => {
        assertValidatorRejects(`
            type HandlingUnit @rootEntity(flexSearch: true) {
                someStrings: [String]
                someCollection: [String] @collect(path: "someStrings", aggregate: DISTINCT) @flexSearchFulltext(language: DE)
            }
        `, `@flexSearch is not supported on collect fields.`);
    });
    it('rejects flexSearchFulltext without language', () => {
        assertValidatorRejects(`
            type HandlingUnit @rootEntity(flexSearch: true) {
                someString: String @flexSearchFulltext
            }
        `, `@flexSearchFulltext requires either a language parameter, or a defaultLanguage must be set in the defining type.`);
    });
    it('rejects flexSearch on child without indexed field', () => {
        assertValidatorRejects(`
            type HandlingUnit @rootEntity(flexSearch: true) {
                someExtension: HandlingUnitInfo @flexSearch
            }
            type HandlingUnitInfo @entityExtension{
                someString: String
            }
        `, `At least one field on type "HandlingUnitInfo" must be annotated with @flexSearch or @flexSearchFulltext.`);
    });
    it('rejects flexSearch isIncludedInSearch for booleans', () => {
        assertValidatorRejects(`
            type HandlingUnit @rootEntity(flexSearch: true) {
                someBool: Boolean @flexSearch(isIncludedInSearch: true)
            }
        `, `"isIncludedInSearch" is not supported on type "Boolean".`);
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
                    arangoSearchIndex: { isIndexed: true }
                }
            ],
            permissionProfiles: [{ namespacePath: [], profiles: { ['restricted']: { permissions: [{ access: 'readWrite', roles: ['allusers'], restrictToAccessGroups: ['RESTRICTED'] }] } } }]
        });
        const type = <RootEntityType>model.types.find(value => value.name === 'HandlingUnit');
        expectSingleErrorToInclude(type.fields.find(value => value.name === 'accessGroup')!, '');

    });
});