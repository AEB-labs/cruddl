/**
 * Is thrown if the transactionTimeoutMs is exceeded
 */
export class TransactionTimeoutError extends Error {
    readonly timeoutMs: number | undefined;

    constructor({ timeoutMs }: { readonly timeoutMs?: number } = {}) {
        super(`Transaction exceeded timeout${timeoutMs ? ' of ' + timeoutMs : ''} and was rolled back`);
        this.name = this.constructor.name;
        this.timeoutMs = timeoutMs;
    }
}

/**
 * Is thrown if a transaction is cancelled via the cancellation token before it completed
 */
export class TransactionCancelledError extends Error {
    constructor() {
        super(`Transaction was cancelled and has been rolled back`);
        this.name = this.constructor.name;
    }
}
