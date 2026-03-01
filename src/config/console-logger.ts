import { inspect } from 'util';
import { Logger, LoggerProvider } from './logging';

export const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const DEFAULT_LOG_LEVEL: LogLevel = 'info';

export interface ConsoleLoggerProviderOptions {
    readonly defaultLevel?: LogLevel;
    readonly levels?: Record<string, LogLevel>;
}

export class ConsoleLoggerProvider implements LoggerProvider {
    constructor(private options: ConsoleLoggerProviderOptions = {}) {}

    getLogger(category?: string | undefined): Logger {
        return new ConsoleLogger({ category: category, level: this.getLevel(category) });
    }

    private getLevel(category: string | undefined): LogLevel {
        if (!category || !this.options.levels || !(category in this.options.levels)) {
            return this.options.defaultLevel ?? DEFAULT_LOG_LEVEL;
        }
        return this.options.levels[category];
    }
}

export interface ConsoleLoggerOptions {
    readonly level: LogLevel;
    readonly category?: string;
}

export class ConsoleLogger implements Logger {
    private readonly category?: string;
    readonly level: LogLevel;

    constructor(options: ConsoleLoggerOptions) {
        this.category = options.category;
        this.level = options.level;
    }

    private log(level: LogLevel, message: string, ...args: unknown[]): void {
        if (!this.isLevelEnabled(level)) {
            return;
        }
        const formattedArgs = args.map((arg) => {
            if (typeof arg === 'string') {
                return arg;
            }
            try {
                return inspect(arg, { depth: 3, breakLength: Infinity });
            } catch {
                return '[Unserializable]';
            }
        });
        const consoleMethod = getConsoleMethod(level);
        consoleMethod(`[${level.toUpperCase()}] ${this.category}: ${message}`, ...formattedArgs);
    }

    trace = (message: string, ...args: unknown[]): void => this.log('trace', message, ...args);
    debug = (message: string, ...args: unknown[]): void => this.log('debug', message, ...args);
    info = (message: string, ...args: unknown[]): void => this.log('info', message, ...args);
    warn = (message: string, ...args: unknown[]): void => this.log('warn', message, ...args);
    error = (message: string, ...args: unknown[]): void => this.log('error', message, ...args);
    fatal = (message: string, ...args: unknown[]): void => this.log('fatal', message, ...args);

    isLevelEnabled(level: string = 'trace') {
        const normalized = normalizeLevel(level);
        if (!normalized) {
            return false;
        }
        return levelPriority(normalized) >= levelPriority(this.level);
    }

    isTraceEnabled = (): boolean => this.isLevelEnabled('trace');
    isDebugEnabled = (): boolean => this.isLevelEnabled('debug');
    isInfoEnabled = (): boolean => this.isLevelEnabled('info');
    isWarnEnabled = (): boolean => this.isLevelEnabled('warn');
    isErrorEnabled = (): boolean => this.isLevelEnabled('error');
    isFatalEnabled = (): boolean => this.isLevelEnabled('fatal');
}

export const DEFAULT_LOGGER_PROVIDER = new ConsoleLoggerProvider();

function normalizeLevel(level: unknown): LogLevel | undefined {
    if (typeof level !== 'string') {
        return undefined;
    }
    const normalized = level.toLowerCase() as LogLevel;
    return LOG_LEVELS.includes(normalized) ? normalized : undefined;
}

function levelPriority(level: LogLevel): number {
    return LOG_LEVELS.indexOf(level);
}

function getConsoleMethod(level: LogLevel): (...args: unknown[]) => void {
    if (level === 'trace' && typeof console.trace === 'function') {
        return console.debug; // trace would print a stacktrace
    }
    if (level === 'debug' && typeof console.debug === 'function') {
        return console.debug;
    }
    if (level === 'warn' && typeof console.warn === 'function') {
        return console.warn;
    }
    if ((level === 'error' || level === 'fatal') && typeof console.error === 'function') {
        return console.error;
    }
    if (typeof console.log === 'function') {
        return console.log;
    }
    return () => {};
}
