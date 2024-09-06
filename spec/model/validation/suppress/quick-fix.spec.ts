import { expectQuickFix } from '../../implementation/validation-utils';
import gql from 'graphql-tag';
import { Project } from '../../../../src/project/project';

describe('@suppress quick fix', () => {
    it('generates a quick fix on type level', () => {
        const project = new Project([
            gql`
                type Stuff @rootEntity {
                    foo: String
                }
                # comment before type
                type Child @childEntity {
                    # comment in type
                    stuff: Int
                }
            `.loc!.source,
        ]);
        expectQuickFix(
            project,
            'Suppress this warning',
            `
                type Stuff @rootEntity {
                    foo: String
                }
                # comment before type
                type Child @childEntity @suppress(warnings: UNUSED) {
                    # comment in type
                    stuff: Int
                }
            `,
        );
    });

    it('generates a quick fix on enum level', () => {
        const project = new Project([
            gql`
                type Stuff @rootEntity {
                    value: myenum
                }

                enum myenum {
                    NAME1
                    NAME2
                }
            `.loc!.source,
        ]);
        expectQuickFix(
            project,
            'Suppress this warning',
            `
                type Stuff @rootEntity {
                    value: myenum
                }

                enum myenum @suppress(warnings: NAMING) {
                    NAME1
                    NAME2
                }
            `,
        );
    });

    it('generates a quick fix on enum value level', () => {
        const project = new Project([
            gql`
                type Stuff @rootEntity {
                    value: MyEnum
                }

                enum MyEnum {
                    NAME1
                    name2
                }
            `.loc!.source,
        ]);
        expectQuickFix(
            project,
            'Suppress this warning',
            `
                type Stuff @rootEntity {
                    value: MyEnum
                }

                enum MyEnum {
                    NAME1
                    name2 @suppress(warnings: NAMING)
                }
            `,
        );
    });

    it('generates a quick fix on field level', () => {
        const project = new Project([
            gql`
                type Stuff @rootEntity {
                    _key: String @key # after field
                    key: String
                }
            `.loc!.source,
        ]);
        expectQuickFix(
            project,
            'Suppress this warning',
            `
                type Stuff @rootEntity {
                    _key: String @key @suppress(warnings: DEPRECATED) # after field
                    key: String
                }
            `,
        );
    });

    it('generates a quick fix if there already is an empty @suppress directive', () => {
        const project = new Project([
            gql`
                type Stuff @rootEntity {
                    _key: String @key @suppress
                    key: String
                }
            `.loc!.source,
        ]);
        expectQuickFix(
            project,
            'Suppress this warning',
            `
                type Stuff @rootEntity {
                    _key: String @key @suppress(warnings: DEPRECATED)
                    key: String
                }
            `,
        );
    });

    it('generates a quick fix if there already is a @suppress directive with a different arg', () => {
        const project = new Project([
            gql`
                type Stuff @rootEntity {
                    _key: String @key @suppress(infos: NO_TYPE_CHECKS)
                    key: String
                }
            `.loc!.source,
        ]);
        expectQuickFix(
            project,
            'Suppress this warning',
            `
                type Stuff @rootEntity {
                    _key: String @key @suppress(infos: NO_TYPE_CHECKS, warnings: DEPRECATED)
                    key: String
                }
            `,
        );
    });

    it('generates a quick fix if there already is a @suppress directive with a single code', () => {
        const project = new Project([
            gql`
                type Stuff @rootEntity {
                    _key: String @key @suppress(warnings: UNUSED)
                    key: String
                }
            `.loc!.source,
        ]);
        expectQuickFix(
            project,
            'Suppress this warning',
            `
                type Stuff @rootEntity {
                    _key: String @key @suppress(warnings: [UNUSED, DEPRECATED])
                    key: String
                }
            `,
        );
    });

    it('generates a quick fix if there already is a @suppress directive with a single code as a list', () => {
        const project = new Project([
            gql`
                type Stuff @rootEntity {
                    _key: String @key @suppress(warnings: [UNUSED])
                    key: String
                }
            `.loc!.source,
        ]);
        expectQuickFix(
            project,
            'Suppress this warning',
            `
                type Stuff @rootEntity {
                    _key: String @key @suppress(warnings: [UNUSED, DEPRECATED])
                    key: String
                }
            `,
        );
    });

    it('generates a quick fix if there already is a @suppress directive with a multiple codes as a list', () => {
        const project = new Project([
            gql`
                type Stuff @rootEntity {
                    _key: String @key @suppress(warnings: [UNUSED, NAMING])
                    key: String
                }
            `.loc!.source,
        ]);
        expectQuickFix(
            project,
            'Suppress this warning',
            `
                type Stuff @rootEntity {
                    _key: String @key @suppress(warnings: [UNUSED, NAMING, DEPRECATED])
                    key: String
                }
            `,
        );
    });
});
