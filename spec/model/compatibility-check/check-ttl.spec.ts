import gql from 'graphql-tag';
import {
    expectSingleCompatibilityIssue,
    expectToBeValid,
} from '../implementation/validation-utils';
import { runCheck } from './utils';
import { Project } from '../../../src/project/project';
import { assertValidatorAcceptsAndDoesNotWarn } from '../../schema/ast-validation-modules/helpers';

describe('checkModel', () => {
    describe('ttl', () => {
        it('rejects if a type should have a TTL config', () => {
            const projectToCheck = new Project([
                gql`
                    type Test @rootEntity {
                        dateField: DateTime
                    }
                `.loc!.source,
            ]);
            expectToBeValid(projectToCheck);

            const baselineProject = new Project([
                gql`
                    type Test @rootEntity {
                        dateField: DateTime
                    }
                `.loc!.source,
                {
                    name: 'ttl.json',
                    body: JSON.stringify({
                        timeToLive: [
                            {
                                typeName: 'Test',
                                dateField: 'dateField',
                                expireAfterDays: 30,
                            },
                        ],
                    }),
                },
            ]);
            expectToBeValid(baselineProject);

            const checkResult = projectToCheck.checkCompatibility(baselineProject);

            expectSingleCompatibilityIssue(
                checkResult,
                'There should be a timeToLive configuration for type "Test".',
            );
        });

        it('rejects if a type should not have a TTL config', () => {
            const projectToCheck = new Project([
                gql`
                    type Test @rootEntity {
                        dateField: DateTime
                    }
                `.loc!.source,
                {
                    name: 'ttl.json',
                    body: JSON.stringify({
                        timeToLive: [
                            {
                                typeName: 'Test',
                                dateField: 'dateField',
                                expireAfterDays: 30,
                            },
                        ],
                    }),
                },
            ]);
            expectToBeValid(projectToCheck);

            const baselineProject = new Project([
                gql`
                    type Test @rootEntity {
                        dateField: DateTime
                    }
                `.loc!.source,
            ]);
            expectToBeValid(baselineProject);

            const checkResult = projectToCheck.checkCompatibility(baselineProject);

            expectSingleCompatibilityIssue(
                checkResult,
                'There does not need to be a timeToLive configuration for type "Test". If the timeToLive configuration is intentional, suppress this message.',
            );
        });

        it('accepts if there is a TTL config in both baseline and project to check', () => {
            const projectToCheck = new Project([
                gql`
                    type Test @rootEntity {
                        dateField: DateTime
                    }
                `.loc!.source,
                {
                    name: 'ttl.json',
                    body: JSON.stringify({
                        timeToLive: [
                            {
                                typeName: 'Test',
                                dateField: 'dateField',
                                expireAfterDays: 15,
                            },
                        ],
                    }),
                },
            ]);
            expectToBeValid(projectToCheck);

            const baselineProject = new Project([
                gql`
                    type Test @rootEntity {
                        dateField: DateTime
                    }
                `.loc!.source,
                {
                    name: 'ttl.json',
                    body: JSON.stringify({
                        timeToLive: [
                            {
                                typeName: 'Test',
                                dateField: 'dateField',
                                expireAfterDays: 30,
                            },
                        ],
                    }),
                },
            ]);
            expectToBeValid(baselineProject);

            const checkResult = projectToCheck.checkCompatibility(baselineProject);

            expectToBeValid(checkResult);
        });
    });
});
