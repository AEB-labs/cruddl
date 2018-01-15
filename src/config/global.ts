export interface SchemaContext {
    readonly loggerProvider?: LoggerProvider;
}

/**
 * Implement a class implementing this interface to use your own logger.
 * As this is also implemented by log4js, you can directly inject your log4js setup.
 */
export interface LoggerProvider {
    getLogger(categoryName?: string): Logger;
}

export interface Logger {
    debug(message: string, ...args: any[]): void;
    info(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    error(message: string, ...args: any[]): void;
}

export class ConsoleLoggerProvider implements LoggerProvider {
    constructor(private prefix?: string) { }

    getLogger(categoryName?: string | undefined): Logger {
        return new ConsoleLogger((this.prefix ? this.prefix + ': ' : '') + (categoryName ? categoryName + ': ' : ''));
    }
}

export class ConsoleLogger implements Logger {
    constructor(private prefix?: string) { }

    debug(message: string, ...args: any[]): void {
        console.log((this.prefix || '') + message, args)
    }
    info = this.debug;
    warn = this.debug;
    error = this.debug;
}

export namespace globalContext {
    export let loggerProvider: ConsoleLoggerProvider;

    /**
     * Restores default values in the global context
     */
    export function unregisterContext() {
        loggerProvider = new ConsoleLoggerProvider();
    }

    /**
     * Resets the global context and applies values of a given schema context
     */
    export function registerContext(context: SchemaContext|undefined) {
        unregisterContext();
        if (context && context.loggerProvider) {
            loggerProvider = context.loggerProvider;
        }
    }

    // init
    unregisterContext();
}