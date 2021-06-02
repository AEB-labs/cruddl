import { expect } from 'chai';
import { print } from 'graphql';
import gql from 'graphql-tag';
import { ParsedProjectSource } from '../../../src/config/parsed-project';
import { ValidationContext } from '../../../src/model/validation';
import { ProjectSource } from '../../../src/project/source';
import { GraphQLRulesValidator } from '../../../src/schema/preparation/source-validation-modules/graphql-rules';
import { parseProjectSource } from '../../../src/schema/schema-builder';

describe('graphql-rules validator', () => {
    const validator = new GraphQLRulesValidator();

    function getParsedProjectSource(ps: ProjectSource): ParsedProjectSource {
        const parsedProjectSource = parseProjectSource(ps, new ValidationContext());
        expect(parsedProjectSource).not.to.be.undefined;
        return parsedProjectSource as ParsedProjectSource;
    }

    it('reports errors', () => {
        const messages = validator.validate(
            getParsedProjectSource(
                new ProjectSource(
                    'file.graphql',
                    print(
                        gql`
                            type Test @unknownDirective {
                                field: String
                            }
                        `
                    )
                )
            )
        );
        expect(messages.length).to.equal(1);
        expect(messages[0].message).to.equal('Unknown directive "@unknownDirective".');
    });

    it('reports wrong directive argument types', () => {
        const messages = validator.validate(
            getParsedProjectSource(
                new ProjectSource(
                    'file.graphql',
                    print(
                        gql`
                            type Test @rootEntity(indices: true) {
                                field: String
                            }
                        `
                    )
                )
            )
        );
        expect(messages.length).to.equal(1);
        expect(messages[0].message).to.equal('Expected value of type "[IndexDefinition!]", found true.');
    });

    it('reports missing directive arguments', () => {
        const messages = validator.validate(
            getParsedProjectSource(
                new ProjectSource(
                    'file.graphql',
                    print(
                        gql`
                            type Test @namespace {
                                field: String
                            }
                        `
                    )
                )
            )
        );
        expect(messages.length).to.equal(1);
        expect(messages[0].message).to.equal(
            `Directive "@namespace" argument "name" of type "String!" is required, but it was not provided.`
        );
    });

    it('reports wrong directive arguments', () => {
        const messages = validator.validate(
            getParsedProjectSource(
                new ProjectSource(
                    'file.graphql',
                    print(
                        gql`
                            type Test @rootEntity(nonExistant: true) {
                                field: String
                            }
                        `
                    )
                )
            )
        );
        expect(messages.length).to.equal(1);
        expect(messages[0].message).to.equal('Unknown argument "nonExistant" on directive "@rootEntity".');
    });

    it('reports missing input fields', () => {
        const messages = validator.validate(
            getParsedProjectSource(
                new ProjectSource(
                    'file.graphql',
                    print(
                        gql`
                            type Test @rootEntity(indices: [{ unique: true }]) {
                                field: String
                            }
                        `
                    )
                )
            )
        );
        expect(messages.length).to.equal(1);
        expect(messages[0].message).to.equal(
            'Field "IndexDefinition.fields" of required type "[String!]!" was not provided.'
        );
    });

    it('reports undefined input fields', () => {
        const messages = validator.validate(
            getParsedProjectSource(
                new ProjectSource(
                    'file.graphql',
                    print(
                        gql`
                            type Test @rootEntity(indices: [{ fields: [], nonExistant: true }]) {
                                field: String
                            }
                        `
                    )
                )
            )
        );
        expect(messages.length).to.equal(1);
        expect(messages[0].message).to.equal('Field "nonExistant" is not defined by type "IndexDefinition".');
    });

    it('accepts valid GraphQL', () => {
        const messages = validator.validate(
            getParsedProjectSource(
                new ProjectSource(
                    'file.graphql',
                    print(
                        gql`
                            type Test @rootEntity {
                                field: String
                            }
                        `
                    )
                )
            )
        );
        expect(messages).to.deep.equal([]);
    });

    it('allows supplying non-lists for lists', () => {
        const messages = validator.validate(
            getParsedProjectSource(
                new ProjectSource(
                    'file.graphql',
                    print(
                        gql`
                            type Test @rootEntity {
                                field: String @roles(read: "role")
                            }
                        `
                    )
                )
            )
        );
        expect(messages).to.deep.equal([]);
    });
});
