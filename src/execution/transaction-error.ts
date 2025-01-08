/**
 * The cause serialized (plain object) representation of an error thrown in an ArangoDB transaction
 *
 * Does not extend Error because this is a JSON-serialized error and does not satisfy "instanceof Error"
 */
export interface TransactionErrorCause {
    readonly message: string;
}

export interface TransactionErrorParams {
    readonly 
}

/**
 * Is thrown if an error occurred while executing the transaction in the database ArangoDB
 */
export class TransactionError extends Error {
    constructor(
        message: string,
        readonly cause: TransactionErrorCause,
    ) {
        super(message);
        this.name = this.constructor.name;
    }
}
