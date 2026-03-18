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
