/**
 * ErrorWithCause extends the default node Error to support causes.
 * Each error can have one cause. The stack of the causing error is appended
 * with an indentation of 4 spaces to the stack of the outer error.
 */
export class ErrorWithCause extends Error {
    cause: Error | undefined;
    constructor(message: string, cause?: Error | unknown) {
        super(extractMessage(message, cause));
        this.name = this.constructor.name;
        if (cause instanceof Error) {
            this.cause = cause;
            if (this.cause.stack) {
                this.stack = `${this.stack}\n    ${this.cause.stack.split('\n').join(`\n    `)}`;
            }
        }
    }
}

function extractMessage(message: string, cause?: Error | unknown): string {
    if (cause === undefined) {
        return message;
    }
    if (cause instanceof Error) {
        return `${message}: ${cause.message}`;
    }
    return `${message}: NonError: ${cause}`;
}
