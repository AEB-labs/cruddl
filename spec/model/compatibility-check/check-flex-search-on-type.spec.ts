import gql from 'graphql-tag';
import {
    expectSingleCompatibilityIssue,
    expectToBeValid,
} from '../implementation/validation-utils';
import { runCheck } from './utils';

describe('checkModel', () => {
    describe('@rootEntity(flexSearch...)', () => {
        it('rejects if flexSearch is missing', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity(flexSearch: true) @modules(in: "module1") {
                        field: String @modules(all: true)
                    }
                `,
                gql`
                    type Test @rootEntity {
                        field: String
                    }
                `,
            );
            expectSingleCompatibilityIssue(
                result,
                'Type "Test" needs to be enable flexSearch (required by module "module1").',
            );
        });

        it('rejects if flexSearch is set to false', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity(flexSearch: true) @modules(in: "module1") {
                        field: String @modules(all: true)
                    }
                `,
                gql`
                    type Test @rootEntity(flexSearch: false) {
                        field: String
                    }
                `,
            );
            expectSingleCompatibilityIssue(
                result,
                'Type "Test" needs to be enable flexSearch (required by module "module1").',
            );
        });

        it('accepts if flexSearch is set to true even if not needed', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity(flexSearch: false) @modules(in: "module1") {
                        field: String @modules(all: true)
                    }
                `,
                gql`
                    type Test @rootEntity(flexSearch: true) {
                        field: String
                    }
                `,
            );
            expectToBeValid(result);
        });

        it('rejects if flexSearchOrder is missing', () => {
            const result = runCheck(
                gql`
                    type Test
                        @rootEntity(
                            flexSearch: true
                            flexSearchOrder: [{ field: "field", direction: ASC }]
                        )
                        @modules(in: "module1") {
                        field: String @modules(all: true)
                    }
                `,
                gql`
                    type Test @rootEntity(flexSearch: true) {
                        field: String
                    }
                `,
            );
            expectSingleCompatibilityIssue(
                result,
                'Type "Test" should specify flexSearchOrder: [{field: "field", direction: ASC}] (required by module "module1").',
            );
        });

        it('rejects if flexSearchOrder should be omitted', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity(flexSearch: true) @modules(in: "module1") {
                        field: String @modules(all: true)
                    }
                `,
                gql`
                    type Test
                        @rootEntity(
                            flexSearch: true
                            flexSearchOrder: [{ field: "field", direction: ASC }]
                        ) {
                        field: String
                    }
                `,
            );
            expectSingleCompatibilityIssue(
                result,
                'Type "Test" should not specify a custom flexSearchOrder (required by module "module1").',
            );
        });

        it('rejects if flexSearchOrder is wrong', () => {
            const result = runCheck(
                gql`
                    type Test
                        @rootEntity(
                            flexSearch: true
                            flexSearchOrder: [{ field: "field", direction: DESC }]
                        )
                        @modules(in: "module1") {
                        field: String @modules(all: true)
                    }
                `,
                gql`
                    type Test
                        @rootEntity(
                            flexSearch: true
                            flexSearchOrder: [{ field: "field", direction: ASC }]
                        ) {
                        field: String
                    }
                `,
            );
            expectSingleCompatibilityIssue(
                result,
                'Type "Test" should specify flexSearchOrder: [{field: "field", direction: DESC}] (required by module "module1").',
            );
        });
    });
});
