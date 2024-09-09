import gql from 'graphql-tag';
import {
    expectSingleCompatibilityIssue,
    expectToBeValid,
} from '../implementation/validation-utils';
import { runCheck } from './utils';

describe('checkModel', () => {
    describe('@flexSearch', () => {
        it('rejects if @flexSearch is missing', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity(flexSearch: true) @modules(in: "module1") {
                        field: String @modules(all: true) @flexSearch
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
                'Field "field" should enable @flexSearch (required by module "module1").',
            );
        });

        it('accepts @flexSearch is present', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity(flexSearch: true) @modules(in: "module1") {
                        field: String @modules(all: true) @flexSearch
                    }
                `,
                gql`
                    type Test @rootEntity(flexSearch: true) {
                        field: String @flexSearch
                    }
                `,
            );
            expectToBeValid(result);
        });

        it('accepts @flexSearch is present even though it is not required', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity(flexSearch: true) @modules(in: "module1") {
                        field: String @modules(all: true)
                    }
                `,
                gql`
                    type Test @rootEntity(flexSearch: true) {
                        field: String @flexSearch
                    }
                `,
            );
            expectToBeValid(result);
        });

        it('rejects if @flexSearch(includeInSearch: true) is missing', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity(flexSearch: true) @modules(in: "module1") {
                        field: String @modules(all: true) @flexSearch(includeInSearch: true)
                    }
                `,
                gql`
                    type Test @rootEntity(flexSearch: true) {
                        field: String @flexSearch
                    }
                `,
            );
            expectSingleCompatibilityIssue(
                result,
                'Field "field" should enable @flexSearch(includeInSearch: true) (required by module "module1").',
            );
        });

        it('rejects if @flexSearch(includeInSearch) should be true but is false', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity(flexSearch: true) @modules(in: "module1") {
                        field: String @modules(all: true) @flexSearch(includeInSearch: true)
                    }
                `,
                gql`
                    type Test @rootEntity(flexSearch: true) {
                        field: String @flexSearch(includeInSearch: false)
                    }
                `,
            );
            expectSingleCompatibilityIssue(
                result,
                'Field "field" should enable @flexSearch(includeInSearch: true) (required by module "module1").',
            );
        });

        it('accepts @flexSearch(includeInSearch: true)', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity(flexSearch: true) @modules(in: "module1") {
                        field: String @modules(all: true) @flexSearch(includeInSearch: true)
                    }
                `,
                gql`
                    type Test @rootEntity(flexSearch: true) {
                        field: String @flexSearch(includeInSearch: true)
                    }
                `,
            );
            expectToBeValid(result);
        });

        it('accepts @flexSearch(includeInSearch: true) even if not required', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity(flexSearch: true) @modules(in: "module1") {
                        field: String @modules(all: true) @flexSearch(includeInSearch: false)
                    }
                `,
                gql`
                    type Test @rootEntity(flexSearch: true) {
                        field: String @flexSearch(includeInSearch: true)
                    }
                `,
            );
            expectToBeValid(result);
        });
    });

    describe('@flexSearchFulltext', () => {
        it('rejects if @flexSearchFulltext is missing', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity(flexSearch: true) @modules(in: "module1") {
                        field: String @modules(all: true) @flexSearchFulltext
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
                'Field "field" should enable @flexSearchFulltext (required by module "module1").',
            );
        });

        it('rejects if @flexSearchFulltext is missing even if @flexSearch is present', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity(flexSearch: true) @modules(in: "module1") {
                        field: String @modules(all: true) @flexSearchFulltext
                    }
                `,
                gql`
                    type Test @rootEntity(flexSearch: true) {
                        field: String @flexSearch
                    }
                `,
            );
            expectSingleCompatibilityIssue(
                result,
                'Field "field" should enable @flexSearchFulltext (required by module "module1").',
            );
        });

        it('accepts @flexSearchFulltext is present', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity(flexSearch: true) @modules(in: "module1") {
                        field: String @modules(all: true) @flexSearchFulltext
                    }
                `,
                gql`
                    type Test @rootEntity(flexSearch: true) {
                        field: String @flexSearchFulltext
                    }
                `,
            );
            expectToBeValid(result);
        });

        it('accepts @flexSearchFulltext is present even though it is not required', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity(flexSearch: true) @modules(in: "module1") {
                        field: String @modules(all: true)
                    }
                `,
                gql`
                    type Test @rootEntity(flexSearch: true) {
                        field: String @flexSearchFulltext
                    }
                `,
            );
            expectToBeValid(result);
        });

        it('rejects if @flexSearchFulltext(includeInSearch: true) is missing', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity(flexSearch: true) @modules(in: "module1") {
                        field: String @modules(all: true) @flexSearchFulltext(includeInSearch: true)
                    }
                `,
                gql`
                    type Test @rootEntity(flexSearch: true) {
                        field: String @flexSearchFulltext
                    }
                `,
            );
            expectSingleCompatibilityIssue(
                result,
                'Field "field" should enable @flexSearch(includeInSearch: true) (required by module "module1").',
            );
        });

        it('rejects if @flexSearchFulltext(includeInSearch) should be true but is false', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity(flexSearch: true) @modules(in: "module1") {
                        field: String @modules(all: true) @flexSearchFulltext(includeInSearch: true)
                    }
                `,
                gql`
                    type Test @rootEntity(flexSearch: true) {
                        field: String @flexSearchFulltext(includeInSearch: false)
                    }
                `,
            );
            expectSingleCompatibilityIssue(
                result,
                'Field "field" should enable @flexSearch(includeInSearch: true) (required by module "module1").',
            );
        });

        it('accepts @flexSearchFulltext(includeInSearch: true)', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity(flexSearch: true) @modules(in: "module1") {
                        field: String @modules(all: true) @flexSearchFulltext(includeInSearch: true)
                    }
                `,
                gql`
                    type Test @rootEntity(flexSearch: true) {
                        field: String @flexSearchFulltext(includeInSearch: true)
                    }
                `,
            );
            expectToBeValid(result);
        });

        it('accepts @flexSearchFulltext(includeInSearch: true) even if not required', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity(flexSearch: true) @modules(in: "module1") {
                        field: String
                            @modules(all: true)
                            @flexSearchFulltext(includeInSearch: false)
                    }
                `,
                gql`
                    type Test @rootEntity(flexSearch: true) {
                        field: String @flexSearchFulltext(includeInSearch: true)
                    }
                `,
            );
            expectToBeValid(result);
        });
    });
});
