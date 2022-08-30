declare module 'json-lint' {
    interface JSONLintOptions {
        comments?: boolean;
    }

    interface JSONLintResult {
        error?: string;

        /**
         * one-based line number of the error
         */
        line?: number;

        /**
         * zero-based character offset of the error
         */
        i?: number;

        /**
         * one-based column number of the error
         */
        character?: number;
    }

    function jsonlint(json: string, options?: JSONLintOptions): JSONLintResult;

    export = jsonlint;
}
