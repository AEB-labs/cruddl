import { expect } from 'chai';
import { DocumentNode } from 'graphql';
import gql from 'graphql-tag';
import { Model, RootEntityType, TypeKind } from '../../../core-exports';
import { FlexSearchLanguage } from '../../../src/model';
import {
    FLEX_SEARCH_CASE_SENSITIVE_ARGUMENT,
    FLEX_SEARCH_INCLUDED_IN_SEARCH_ARGUMENT,
} from '../../../src/schema/constants';
import {
    assertValidatorAccepts,
    assertValidatorAcceptsAndDoesNotWarn,
    assertValidatorRejects,
    assertValidatorWarns,
} from '../../schema/ast-validation-modules/helpers';
import { createSimpleModel } from '../model-spec.helper';
import { expectSingleErrorToInclude } from './validation-utils';

describe('FlexSearch', () => {
    it('rejects flexSearch on relation', () => {
        assertValidatorRejects(
            `
            type HandlingUnit @rootEntity(flexSearch: true) {
                otherHandlingUnit: HandlingUnit @relation @flexSearch
            }
        `,
            `@flexSearch is not supported on relations.`,
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
            `@flexSearch is not supported on references.`,
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
            `@flexSearch is not supported on collect fields.`,
        );
    });

    it('accepts flexSearch flexSearchFulltext on strings', () => {
        // currently we allow pretty much every type on @flexSearch (which is a bug),
        // but when we change this, we should not break e.g. Strings
        assertValidatorAccepts(
            `
            type HandlingUnit @rootEntity(flexSearch: true) {
                handlingUnitNumber: String @flexSearchFulltext @flexSearch
            }
        `,
        );
    });

    it('accepts flexSearch and flexSearchFulltext on I18nString', () => {
        assertValidatorAccepts(
            `
            type HandlingUnit @rootEntity(flexSearch: true) {
                handlingUnitNumber: I18nString @flexSearchFulltext @flexSearch
            }
        `,
        );
    });

    it('rejects flexSearchFulltext on numbers', () => {
        assertValidatorRejects(
            `
            type HandlingUnit @rootEntity(flexSearch: true) {
                someNumbers: [Int] @flexSearchFulltext(language: DE)
            }
        `,
            `@flexSearchFulltext is not supported on type "Int".`,
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
            `@flexSearch is not supported on collect fields.`,
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
            `At least one field on type "HandlingUnitInfo" must be annotated with @flexSearch or @flexSearchFulltext if @flexSearch is specified on the type declaration.`,
        );
    });

    it('rejects flexSearch includeInSearch for booleans', () => {
        assertValidatorRejects(
            `
            type HandlingUnit @rootEntity(flexSearch: true) {
                someBool: Boolean @flexSearch(includeInSearch: true)
            }
        `,
            `"${FLEX_SEARCH_INCLUDED_IN_SEARCH_ARGUMENT}: true" is only supported on the types "String", "[String]" and object types.`,
        );
    });

    it('rejects flexSearch caseSensitive:false for Integers', () => {
        assertValidatorRejects(
            `
            type HandlingUnit @rootEntity(flexSearch: true) {
                someInt: Int @flexSearch(caseSensitive: false)
            }
        `,
            `"${FLEX_SEARCH_CASE_SENSITIVE_ARGUMENT}" is only supported on the types "String" and "[String]".`,
        );
    });

    it('accepts flexSearch includeInSearch for string arrays', () => {
        assertValidatorAccepts(`
            type HandlingUnit @rootEntity(flexSearch: true) {
                someListOfStrings: [String] @flexSearch(includeInSearch: true)
            }
        `);
    });

    it('rejects flexSearchFulltext on fields of type JSON', () => {
        assertValidatorRejects(
            `
            type HandlingUnit @rootEntity(flexSearch: true) {
                data: JSON @flexSearchFulltext
            }
        `,
            '@flexSearchFulltext is not supported on type "JSON".',
        );
    });

    it('accepts flexSearch on enum fields', () => {
        assertValidatorAcceptsAndDoesNotWarn(
            `
            type HandlingUnit @rootEntity(flexSearch: true) {
                field: Enum @flexSearch
            }
            
            enum Enum {
                VALUE
            }
        `,
        );
    });

    it('warns about flexSearch on fields of type JSON', () => {
        assertValidatorWarns(
            `
            type HandlingUnit @rootEntity(flexSearch: true) {
                data: JSON @flexSearch
            }
        `,
            '@flexSearch is not supported on type "JSON". Remove this directive. This will be an error in a future release.',
        );
    });

    it('rejects flexSearch without accessField', () => {
        const model = new Model({
            types: [
                {
                    name: 'HandlingUnit',
                    kind: TypeKind.ROOT_ENTITY,
                    fields: [{ name: 'accessGroup', typeName: 'String' }],
                    permissions: {
                        permissionProfileName: 'restricted',
                    },
                    flexSearchIndexConfig: { isIndexed: true, primarySort: [] },
                },
            ],
            permissionProfiles: [
                {
                    namespacePath: [],
                    profiles: {
                        ['restricted']: {
                            permissions: [
                                {
                                    access: 'readWrite',
                                    roles: ['allusers'],
                                    restrictToAccessGroups: ['RESTRICTED'],
                                },
                            ],
                        },
                    },
                },
            ],
        });
        const type = <RootEntityType>model.types.find((value) => value.name === 'HandlingUnit');
        expectSingleErrorToInclude(type.fields.find((value) => value.name === 'accessGroup')!, '');
    });

    it('accepts a valid primarySort', () => {
        assertValidatorAcceptsAndDoesNotWarn(`
            type HandlingUnit @rootEntity(flexSearch: true, flexSearchOrder: [{field: "someString", direction: ASC}]) {
                someString: String @flexSearch
            }
        `);
        assertValidatorAcceptsAndDoesNotWarn(`
            type HandlingUnit @rootEntity(flexSearch: true, flexSearchOrder: [{field: "someExtension.someString", direction: ASC}]) {
                someExtension: HandlingUnitInfo @flexSearch
            }
            type HandlingUnitInfo @entityExtension{
                someString: String @flexSearch
            }
        `);
    });

    it('rejects primarySort without field', () => {
        assertValidatorRejects(
            `
            type HandlingUnit @rootEntity(flexSearch: true, flexSearchOrder: [{direction: ASC}]) {
                someExtension: HandlingUnitInfo @flexSearch
            }
            type HandlingUnitInfo @entityExtension{
                someString: String
            }
        `,
            `Field "FlexSearchOrderArgument.field" of required type "String!" was not provided.`,
        );
    });

    it('warns about primarySort with missing field', () => {
        assertValidatorWarns(
            `
            type HandlingUnit @rootEntity(flexSearch: true, flexSearchOrder: [{field: "someTypo", direction: ASC}]) {
                someString: String @flexSearch
            }
        `,
            `Type "HandlingUnit" does not have a field "someTypo". This will be an error in a future release.`,
        );
    });

    // this is ok, the primary sort field does not need to be included in the index
    it('accepts about primarySort with field that is not flexSearch-indexed', () => {
        assertValidatorAcceptsAndDoesNotWarn(
            `
            type HandlingUnit @rootEntity(flexSearch: true, flexSearchOrder: [{field: "someString", direction: ASC}]) {
                someString: String
            }
        `,
        );
    });

    it('warns about primarySort with object-typed field', () => {
        assertValidatorWarns(
            `
            type HandlingUnit @rootEntity(flexSearch: true, flexSearchOrder: [{field: "someObject", direction: ASC}]) {
                someObject: HandlingUnitInfo @flexSearch
            }
            type HandlingUnitInfo @entityExtension{
                someString: String @flexSearch
            }
        `,
            `Field "HandlingUnit.someObject" is an object field, but only scalar and enum fields are supported in flexSearchOrder. Choose a subfield or a different field. This will be an error in a future release.`,
        );
    });

    it('warns about primarySort with missing direction', () => {
        assertValidatorWarns(
            `
            type HandlingUnit @rootEntity(flexSearch: true, flexSearchOrder: [{field: "someString"}]) {
                someString: String @flexSearch
            }
        `,
            'Field "FlexSearchOrderArgument.direction" of required type "OrderDirection!" was not provided. "ASC" will be assumed. This will be an error in a future release.',
        );
    });

    // this is ok because it makes it easier to disable flexSearch while still keeping the configs
    it('accepts primarySort when flexSearch is not enabled', () => {
        assertValidatorAcceptsAndDoesNotWarn(
            `
            type HandlingUnit @rootEntity(flexSearchOrder: [{field: "someString", direction: ASC}]) {
                someString: String
            }
        `,
        );
    });

    it('uses EN as default language for flexSearchFulltext', () => {
        const document: DocumentNode = gql`
            type HandlingUnit @rootEntity(flexSearch: true) {
                someString: String @flexSearchFulltext
            }
        `;
        const model = createSimpleModel(document);
        expect(model.validate().getErrors(), model.validate().toString()).to.deep.equal([]);
        const type = model.rootEntityTypes.find((value) => value.name === 'HandlingUnit');
        const field = type?.fields.find((value) => value.name === 'someString');
        expect(field?.flexSearchLanguage).to.equal(FlexSearchLanguage.EN);
    });
});
