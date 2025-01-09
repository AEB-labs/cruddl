import { RelationSide, RootEntityType } from '../model';
import { QueryNode } from './base';
import { TOO_MANY_OBJECTS_ERROR } from './errors';

export interface QueryResultValidatorFunctionProvider {
    /**
     * Gets a unique name for this validator function
     * @returns {string}
     */
    getValidatorName(): string;

    /**
     * Gets the validation function
     *
     * The may be serialized and transported to a different JavaScript engine, so it should work stand-alone and not
     * rely on any libraries.
     *
     * The actual arguments for the function are the result of getValidatorData() and the value of the result variable.
     */
    getValidatorFunction(): (validationData: any, result: any) => void;
}

/**
 * Specifies how a value should be validated
 *
 * This can be used in a PreExecQueryNode. It will be evaluated on its result variable. If the validator reports an
 * error, the whole transaction is cancelled.
 */
export interface QueryResultValidator extends QueryNode {
    /**
     * The name of the validator function (QueryResultValidatorFunctionProvider), which should be present in
     * ALL_QUERY_RESULT_VALIDATOR_FUNCTION_PROVIDERS
     */
    getValidatorName(): string;

    /**
     * Optional data to be passed to the validator function
     */
    getValidatorData(): any;
}

export interface ValidatorParams {
    readonly errorMessage: string;
    readonly errorCode?: string;
}

/**
 * A validator that verifies that a value is truthy
 */
export class ErrorIfNotTruthyResultValidator extends QueryNode implements QueryResultValidator {
    readonly errorMessage: string;
    readonly errorCode?: string;

    constructor(params: ValidatorParams) {
        super();
        this.errorMessage = params.errorMessage;
        this.errorCode = params.errorCode;
    }

    // The following function will be translated to a string and executed within the ArangoDB server itself.
    // Therefore the next comment is necessary to instruct our test coverage tool (https://github.com/istanbuljs/nyc)
    // not to instrument the code with coverage instructions.

    /* istanbul ignore next */
    static getValidatorFunction() {
        return function (validationData: any, result: any) {
            /**
             * An error that is thrown if a validator fails
             */
            class RuntimeValidationError extends Error {
                readonly code: string | undefined;

                constructor(message: string, args: { readonly code?: string } = {}) {
                    super(message);
                    this.name = this.constructor.name;
                    this.code = args.code;
                }
            }

            if (!result) {
                throw new RuntimeValidationError(validationData.errorMessage, {
                    code: validationData.errorCode,
                });
            }
        };
    }

    static getValidatorName() {
        return 'ErrorIfNotTruthy';
    }

    getValidatorName() {
        return ErrorIfNotTruthyResultValidator.getValidatorName();
    }

    getValidatorData() {
        return {
            errorMessage: this.errorMessage,
            errorCode: this.errorCode,
        };
    }

    describe() {
        return 'not truthy => error';
    }
}

/**
 * Validates that a TransformListQueryNode does not resolve to fewer elements
 * than expected. This can happen when an implicit query/mutation limit is applied
 * to the TransformListQueryNode but more elements are available in the collection.
 *
 * In this case a helpful error message should be returned to the consumer so that
 * a manual query limit can be applied.
 */
export class NoImplicitlyTruncatedListValidator extends QueryNode implements QueryResultValidator {
    constructor(
        private readonly maximumExpectedNumberOfItems: number,
        private readonly operation: string,
    ) {
        super();
    }

    // The following function will be translated to a string and executed within the ArangoDB server itself.
    // Therefore the next comment is necessary to instruct our test coverage tool (https://github.com/istanbuljs/nyc)
    // not to instrument the code with coverage instructions.

    /* istanbul ignore next */
    static getValidatorFunction() {
        return function (validationData: any, result: any) {
            /**
             * An error that is thrown if a validator fails
             */
            class RuntimeValidationError extends Error {
                readonly code: string | undefined;

                constructor(message: string, args: { readonly code?: string } = {}) {
                    super(message);
                    this.name = this.constructor.name;
                    this.code = args.code;
                }
            }

            const limit = validationData.maximumExpectedNumberOfItems;
            if (result.length > validationData.maximumExpectedNumberOfItems) {
                if (validationData.operation === 'query') {
                    throw new RuntimeValidationError(
                        `Query would return more than ${limit} objects. Specify "first" to increase the limit or truncate the result.`,
                        {
                            code: validationData.tooManyObjectsError,
                        },
                    );
                } else {
                    throw new RuntimeValidationError(
                        `Mutation would affect more than ${limit} objects. Specify "first" to increase the limit or truncate the result`,
                        {
                            code: validationData.tooManyObjectsError,
                        },
                    );
                }
            }
        };
    }

    static getValidatorName() {
        return 'ErrorIfImplicitlyTruncatedListValidator';
    }

    getValidatorName() {
        return NoImplicitlyTruncatedListValidator.getValidatorName();
    }

    getValidatorData() {
        return {
            maximumExpectedNumberOfItems: this.maximumExpectedNumberOfItems,
            operation: this.operation,
            tooManyObjectsError: TOO_MANY_OBJECTS_ERROR,
        };
    }

    describe() {
        return 'list implicitly truncated => error';
    }
}

/**
 * A validator that verifies that a value is neither falsy nor empty (works for both strings and lists)
 */
export class ErrorIfEmptyResultValidator extends QueryNode implements QueryResultValidator {
    readonly errorMessage: string;
    readonly errorCode?: string;

    constructor(params: ValidatorParams) {
        super();
        this.errorMessage = params.errorMessage;
        this.errorCode = params.errorCode;
    }

    // The following function will be translated to a string and executed within the ArangoDB server itself.
    // Therefore the next comment is necessary to instruct our test coverage tool (https://github.com/istanbuljs/nyc)
    // not to instrument the code with coverage instructions.

    /* istanbul ignore next */
    static getValidatorFunction() {
        return function (validationData: any, result: any) {
            /**
             * An error that is thrown if a validator fails
             */
            class RuntimeValidationError extends Error {
                readonly code: string | undefined;

                constructor(message: string, args: { readonly code?: string } = {}) {
                    super(message);
                    this.name = this.constructor.name;
                    this.code = args.code;
                }
            }

            if (!result || !result.length) {
                throw new RuntimeValidationError(validationData.errorMessage, {
                    code: validationData.errorCode,
                });
            }
        };
    }

    static getValidatorName() {
        return 'ErrorIfEmpty';
    }

    getValidatorName() {
        return ErrorIfEmptyResultValidator.getValidatorName();
    }

    getValidatorData() {
        return {
            errorMessage: this.errorMessage,
            errorCode: this.errorCode,
        };
    }

    describe() {
        return 'if empty => error';
    }
}

export interface NoRestrictingObjectsOnDeleteValidatorParams {
    readonly restrictedRootEntityType: RootEntityType;
    readonly restrictingRootEntityType: RootEntityType;
    readonly path: ReadonlyArray<RelationSide>;
}

interface NoRestrictingObjectsOnDeleteValidatorData {
    readonly restrictedTypeName: string;
    readonly restrictingTypeName: string;
    readonly path: string;
}

/**
 * A validator that verifies that a list is empty, and if it's not, it reports them as restring a delete operation
 */
export class NoRestrictingObjectsOnDeleteValidator
    extends QueryNode
    implements QueryResultValidator
{
    readonly data: NoRestrictingObjectsOnDeleteValidatorData;

    constructor(params: NoRestrictingObjectsOnDeleteValidatorParams) {
        super();
        this.data = {
            restrictingTypeName: params.restrictingRootEntityType.name,
            restrictedTypeName: params.restrictedRootEntityType.name,
            path: params.path.map((s) => s.getSourceFieldOrThrow().name).join('.'),
        };
    }

    // The following function will be translated to a string and executed within the ArangoDB server itself.
    // Therefore the next comment is necessary to instruct our test coverage tool (https://github.com/istanbuljs/nyc)
    // not to instrument the code with coverage instructions.

    /* istanbul ignore next */
    static getValidatorFunction() {
        return function (
            validationData: NoRestrictingObjectsOnDeleteValidatorData,
            result: ReadonlyArray<string>,
        ) {
            /**
             * An error that is thrown if a validator fails
             */
            class RuntimeValidationError extends Error {
                readonly code: string | undefined;

                constructor(message: string, args: { readonly code?: string } = {}) {
                    super(message);
                    this.name = this.constructor.name;
                    this.code = args.code;
                }
            }

            if (result.length) {
                if (result.length === 1) {
                    throw new RuntimeValidationError(
                        `Cannot delete ${validationData.restrictedTypeName} object because a ${validationData.restrictingTypeName} object is still referenced via ${validationData.path} (id: ${result[0]})`,
                        {
                            code: 'RELATION_CONSTRAINT_VIOLATION',
                        },
                    );
                }

                let ids = result
                    .slice(0, 5)
                    .map((id) => id)
                    .join(', ');
                if (result.length > 5) {
                    ids += ', ...';
                }
                throw new RuntimeValidationError(
                    `Cannot delete ${validationData.restrictedTypeName} object because ${result.length} ${validationData.restrictingTypeName} objects are still referenced via ${validationData.path} (ids: ${ids})`,
                    {
                        code: 'RELATION_CONSTRAINT_VIOLATION',
                    },
                );
            }
        };
    }

    static getValidatorName() {
        return 'NoRestrictingObjectsOnDelete';
    }

    getValidatorName() {
        return NoRestrictingObjectsOnDeleteValidator.getValidatorName();
    }

    getValidatorData() {
        return this.data;
    }

    describe() {
        return 'not empty => error with ids of relation constraint violations';
    }
}

export const ALL_QUERY_RESULT_VALIDATOR_FUNCTION_PROVIDERS: ReadonlyArray<QueryResultValidatorFunctionProvider> =
    [
        ErrorIfNotTruthyResultValidator,
        ErrorIfEmptyResultValidator,
        NoRestrictingObjectsOnDeleteValidator,
        NoImplicitlyTruncatedListValidator,
    ];
