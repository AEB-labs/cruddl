/**
 * Implement a class implementing this interface to use your own logger.
 * As this is also implemented by log4js, you can directly inject your log4js setup.
 */
export interface LoggerProvider {
    getLogger(categoryName?: string): Logger;
}

export interface Logger {
    level: unknown;

    isLevelEnabled(level?: string): boolean;

    isTraceEnabled(): boolean;

    isDebugEnabled(): boolean;

    isInfoEnabled(): boolean;

    isWarnEnabled(): boolean;

    isErrorEnabled(): boolean;

    isFatalEnabled(): boolean;

    trace(message: string, ...args: any[]): void;

    debug(message: string, ...args: any[]): void;

    info(message: string, ...args: any[]): void;

    warn(message: string, ...args: any[]): void;

    error(message: string, ...args: any[]): void;

    fatal(message: string, ...args: any[]): void;
}

export class ConsoleLoggerProvider implements LoggerProvider {
    constructor(private prefix?: string) {}

    getLogger(categoryName?: string | undefined): Logger {
        return new ConsoleLogger(
            (this.prefix ? this.prefix + ': ' : '') + (categoryName ? categoryName + ': ' : ''),
        );
    }
}

export class ConsoleLogger implements Logger {
    constructor(private prefix?: string) {}

    private _log(message: string, ...args: any[]): void {
        console.log((this.prefix || '') + message, ...args);
    }

    trace = this._log;
    debug = this._log;
    info = this._log;
    warn = this._log;
    error = this._log;
    fatal = this._log;

    level = 'trace';

    isLevelEnabled = () => true;
    isTraceEnabled = () => true;
    isDebugEnabled = () => true;
    isInfoEnabled = () => true;
    isWarnEnabled = () => true;
    isErrorEnabled = () => true;
    isFatalEnabled = () => true;
}

export const DEFAULT_LOGGER_PROVIDER = new ConsoleLoggerProvider();
