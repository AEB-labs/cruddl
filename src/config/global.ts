import {debug} from "util";

export interface GlobalContext {
    readonly loggerProvider?: LoggerProvider;
}

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
    getLogger(categoryName?: string | undefined): Logger {
        return new ConsoleLogger();
    }
}

export class ConsoleLogger implements Logger {
    debug(message: string, ...args: any[]): void {
        console.log(message, args)
    }
    info = debug;
    warn = debug;
    error = debug;
}

export namespace globalContext {
    export let loggerProvider: ConsoleLoggerProvider = new ConsoleLoggerProvider();

    export function registerContext(context: GlobalContext) {
        if (context.loggerProvider) {
            loggerProvider = context.loggerProvider;
        }
    }
}