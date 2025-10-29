import { Logger, LoggerProvider } from '../../src/config/logging';

export class WarnAndErrorLoggerProvider implements LoggerProvider {
    getLogger(category: string): Logger {
        // note: can't use log4js's getLogger because we can't set a log level on a logger
        // (setting .level on a logger actually changes the level globally for that category)
        return new WarnAndErrorLogger(category);
    }
}

export class WarnAndErrorLogger implements Logger {
    constructor(private category?: string) {}

    trace = () => {};
    debug = () => {};
    info = () => {};
    warn = (message: string, ...args: unknown[]) =>
        console.warn(`[WARN] ${this.category}: ${message}`, ...args);
    error = (message: string, ...args: unknown[]) =>
        console.error(`[ERROR] ${this.category}: ${message}`, ...args);
    fatal = (message: string, ...args: unknown[]) =>
        console.error(`[FATAL] ${this.category}: ${message}`, ...args);

    level = 'warn';

    isLevelEnabled = (level: string) => ['warn', 'error', 'fatal'].includes(level.toLowerCase());
    isTraceEnabled = () => false;
    isDebugEnabled = () => false;
    isInfoEnabled = () => false;
    isWarnEnabled = () => true;
    isErrorEnabled = () => true;
    isFatalEnabled = () => true;
}
