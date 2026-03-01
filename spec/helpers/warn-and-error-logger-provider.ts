import type { Logger, LoggerProvider } from '../../src/config/logging.js';

export class WarnAndErrorLoggerProvider implements LoggerProvider {
    getLogger(category: string): Logger {
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
