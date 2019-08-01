import { Model, RootEntityType, TypeKind } from '../../../core-exports';
import { assertValidatorRejects } from '../../schema/ast-validation-modules/helpers';
import { expectSingleErrorToInclude } from './validation-utils';

describe('QuickSearch', () => {
    it('rejects quickSearch on relation', () => {
        assertValidatorRejects(`
            type HandlingUnit @rootEntity(quickSearchIndex: true) {
                otherHandlingUnit: HandlingUnit @relation @quickSearchIndex 
            }
        `, `QuickSearchIndex is not supported on relations.`);
    });
    it('rejects quickSearch on reference', () => {
        assertValidatorRejects(`
            type HandlingUnit @rootEntity(quickSearchIndex: true) {
                key: String @key
                otherHandlingUnit: HandlingUnit @reference @quickSearchIndex 
            }
        `, `QuickSearchIndex is not supported on references.`);
    });
    it('rejects quickSearch on collect fields', () => {
        assertValidatorRejects(`
            type HandlingUnit @rootEntity(quickSearchIndex: true) {
                someNumbers: [Int]
                someCollection: Int @collect(path: "someNumbers", aggregate: SUM) @quickSearchIndex
            }
        `, `QuickSearchIndex is not supported on collect fields.`);
    });
    it('rejects quickSearchFulltext on numbers', () => {
        assertValidatorRejects(`
            type HandlingUnit @rootEntity(quickSearchIndex: true) {
                someNumbers: [Int] @quickSearchFulltextIndex(language: DE)
            }
        `, `QuickSearchFulltextIndex is not supported on type "Int".`);
    });
    it('rejects quickSearchFulltext on collect fields', () => {
        assertValidatorRejects(`
            type HandlingUnit @rootEntity(quickSearchIndex: true) {
                someStrings: [String]
                someCollection: [String] @collect(path: "someStrings", aggregate: DISTINCT) @quickSearchFulltextIndex(language: DE)
            }
        `, `QuickSearchIndex is not supported on collect fields.`);
    });
    it('rejects quickSearchFulltext without language', () => {
        assertValidatorRejects(`
            type HandlingUnit @rootEntity(quickSearchIndex: true) {
                someString: String @quickSearchFulltextIndex
            }
        `, `QuickSearchFulltextIndex requires either a language parameter, or a defaultLanguage must be set in the defining type.`);
    });
    it('rejects quickSearch on child without indexed field', () => {
        assertValidatorRejects(`
            type HandlingUnit @rootEntity(quickSearchIndex: true) {
                someExtension: HandlingUnitInfo @quickSearchIndex
            }
            type HandlingUnitInfo @entityExtension{
                someString: String
            }
        `, `At least one field on type "HandlingUnitInfo" must be quickSearchIndexed or quickSearchFulltextIndexed.`);
    });
    it('rejects quickSearch isIncludedInSearch for booleans', () => {
        assertValidatorRejects(`
            type HandlingUnit @rootEntity(quickSearchIndex: true) {
                someBool: Boolean @quickSearchIndex(isIncludedInSearch: true)
            }
        `, `"isIncludedInSearch" is not supported on type "Boolean".`);
    });
    it('rejects quickSearch without accessField', () => {
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