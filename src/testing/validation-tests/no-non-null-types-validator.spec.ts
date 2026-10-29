import { describe, it } from 'vitest';
import { Project } from '../../core/project/project.js';
import { ProjectSource } from '../../core/project/source.js';
import { expectQuickFix } from '../utils/model-validation-utils.js';
import {
    assertValidatorAcceptsAndDoesNotWarn,
    assertValidatorWarns,
} from '../utils/source-validation-utils.js';

describe('no-non-null-types validator', () => {
    it('warns for a non-null scalar field', () => {
        assertValidatorWarns(
            `
            type Stuff @rootEntity {
                foo: String!
            }
        `,
            'Non-null types (!) have no effect and should be removed.',
        );
    });

    it('warns for a non-null list field', () => {
        assertValidatorWarns(
            `
            type Stuff @rootEntity {
                foo: [String]!
            }
        `,
            'Non-null types (!) have no effect and should be removed.',
        );
    });

    it('warns for a non-null element inside a list', () => {
        assertValidatorWarns(
            `
            type Stuff @rootEntity {
                foo: [String!]
            }
        `,
            'Non-null types (!) have no effect and should be removed.',
        );
    });

    it('warns once for a field with multiple non-null markers', () => {
        assertValidatorWarns(
            `
            type Stuff @rootEntity {
                foo: [String!]!
            }
        `,
            'Non-null types (!) have no effect and should be removed.',
        );
    });

    it('accepts a nullable scalar field', () => {
        assertValidatorAcceptsAndDoesNotWarn(`
            type Stuff @rootEntity {
                foo: String
            }
        `);
    });

    it('accepts a nullable list field with nullable elements', () => {
        assertValidatorAcceptsAndDoesNotWarn(`
            type Stuff @rootEntity {
                foo: [String]
            }
        `);
    });

    describe('quick fix', () => {
        it('removes "!" from a scalar field', () => {
            expectQuickFix(
                new Project([
                    new ProjectSource('schema.graphqls', 'type Stuff @rootEntity { foo: String! }'),
                ]),
                'Remove "!"',
                'type Stuff @rootEntity { foo: String }',
            );
        });

        it('removes "!" from list items and the list itself', () => {
            expectQuickFix(
                new Project([
                    new ProjectSource(
                        'schema.graphqls',
                        'type Stuff @rootEntity { foo: [String!]! }',
                    ),
                ]),
                'Remove "!"',
                'type Stuff @rootEntity { foo: [String] }',
            );
        });

        it('keeps directives after the type', () => {
            expectQuickFix(
                new Project([
                    new ProjectSource(
                        'schema.graphqls',
                        'type Stuff @rootEntity { foo: [Child!] @relation }\ntype Child @rootEntity { name: String }',
                    ),
                ]),
                'Remove "!"',
                'type Stuff @rootEntity { foo: [Child] @relation }\ntype Child @rootEntity { name: String }',
            );
        });
    });
});
