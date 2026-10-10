import { gql } from 'graphql-tag';
import { describe, it } from 'vitest';
import {
    expectSingleCompatibilityIssue,
    expectToBeValid,
} from '../../../testing/utils/model-validation-utils.js';
import { runCheck } from './testing/run-check.js';

describe('checkModel', () => {
    describe('vector indices', () => {
        it('accepts if a vector index is required and present', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1", includeAllFields: true) {
                        embedding: [Float]
                            @vectorIndex(dimension: 3, nLists: 10, defaultNProbe: 10, maxNProbe: 50)
                    }
                `,
                gql`
                    type Test @rootEntity {
                        embedding: [Float]
                            @vectorIndex(dimension: 3, nLists: 10, defaultNProbe: 10, maxNProbe: 50)
                    }
                `,
            );
            expectToBeValid(result);
        });

        it('accepts if a vector index with optional params is required and present', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1", includeAllFields: true) {
                        embedding: [Float]
                            @vectorIndex(
                                metric: INNER_PRODUCT
                                dimension: 768
                                nLists: 100
                                sparse: false
                                defaultNProbe: 5
                                maxNProbe: 100
                                trainingIterations: 30
                                factory: "IVF100,Flat"
                                storedValues: ["tenantId", "category.code"]
                            )
                        tenantId: String
                        category: Category
                    }

                    type Category @entityExtension @modules(in: "module1", includeAllFields: true) {
                        code: String
                    }
                `,
                gql`
                    type Test @rootEntity {
                        embedding: [Float]
                            @vectorIndex(
                                metric: INNER_PRODUCT
                                dimension: 768
                                nLists: 100
                                sparse: false
                                defaultNProbe: 5
                                maxNProbe: 100
                                trainingIterations: 30
                                factory: "IVF100,Flat"
                                storedValues: ["tenantId", "category.code"]
                            )
                        tenantId: String
                        category: Category
                    }

                    type Category @entityExtension {
                        code: String
                    }
                `,
            );
            expectToBeValid(result);
        });

        it('rejects if a vector index is required but missing', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1", includeAllFields: true) {
                        embedding: [Float]
                            @vectorIndex(dimension: 3, nLists: 10, defaultNProbe: 10, maxNProbe: 50)
                    }
                `,
                gql`
                    type Test @rootEntity {
                        embedding: [Float]
                    }
                `,
            );
            expectSingleCompatibilityIssue(
                result,
                'The vector index is missing: @vectorIndex(metric: COSINE, dimension: 3, nLists: 10, sparse: true, defaultNProbe: 10, maxNProbe: 50) on field "embedding"',
            );
        });

        it('rejects if a vector index exists with different params', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1", includeAllFields: true) {
                        embedding: [Float]
                            @vectorIndex(dimension: 3, nLists: 10, defaultNProbe: 10, maxNProbe: 50)
                    }
                `,
                gql`
                    type Test @rootEntity {
                        embedding: [Float]
                            @vectorIndex(
                                metric: L2
                                dimension: 3
                                nLists: 10
                                defaultNProbe: 10
                                maxNProbe: 50
                            )
                    }
                `,
            );
            expectSingleCompatibilityIssue(
                result,
                'The vector index has wrong parameters, should be: @vectorIndex(metric: COSINE, dimension: 3, nLists: 10, sparse: true, defaultNProbe: 10, maxNProbe: 50) on field "embedding"',
            );
        });
    });
});
