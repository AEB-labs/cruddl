/**
 * Is thrown if an error occurred while executing the transaction within ArangoDB
 */
export class TransactionError extends Error {
    constructor(message: string, readonly cause: Error) {
        super(message);
        this.name = this.constructor.name;
    }
}
