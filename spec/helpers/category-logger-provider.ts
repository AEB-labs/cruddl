import { inspect } from 'util';
import type { Logger, LoggerProvider } from '../../src/config/logging.js';

const LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;
type LogLevel = (typeof LEVELS)[number];

const defaultLogLevel: LogLevel = 'trace';
const categoryLogLevels = new Map<string, LogLevel>();

function normalizeLevel(level: unknown): LogLevel | undefined {
    if (typeof level !== 'string') {
        return undefined;
    }
    const normalized = level.toLowerCase() as LogLevel;
    return LEVELS.includes(normalized) ? normalized : undefined;
}

function levelPriority(level: LogLevel): number {
    return LEVELS.indexOf(level);
}

function getCategoryLevel(category: string): LogLevel {
    const storedLevel = categoryLogLevels.get(category);
    if (storedLevel) {
        return storedLevel;
    }
    categoryLogLevels.set(category, defaultLogLevel);
    return defaultLogLevel;
}

function setCategoryLevel(category: string, level: LogLevel): void {
    categoryLogLevels.set(category, level);
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

class SharedCategoryLogger implements Logger {
    constructor(private readonly category: string) {}

    get level(): unknown {
        return getCategoryLevel(this.category);
    }

    set level(value: unknown) {
        const normalized = normalizeLevel(value);
        if (!normalized) {
            return;
        }
        setCategoryLevel(this.category, normalized);
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
        getConsoleMethod(level)(
            `[${level.toUpperCase()}] ${this.category}: ${message}`,
            ...formattedArgs,
        );
    }

    isLevelEnabled = (level: string = 'trace'): boolean => {
        const normalized = normalizeLevel(level);
        if (!normalized) {
            return false;
        }
        return levelPriority(normalized) >= levelPriority(getCategoryLevel(this.category));
    };

    isTraceEnabled = (): boolean => this.isLevelEnabled('trace');
    isDebugEnabled = (): boolean => this.isLevelEnabled('debug');
    isInfoEnabled = (): boolean => this.isLevelEnabled('info');
    isWarnEnabled = (): boolean => this.isLevelEnabled('warn');
    isErrorEnabled = (): boolean => this.isLevelEnabled('error');
    isFatalEnabled = (): boolean => this.isLevelEnabled('fatal');

    trace = (message: string, ...args: unknown[]): void => this.log('trace', message, ...args);
    debug = (message: string, ...args: unknown[]): void => this.log('debug', message, ...args);
    info = (message: string, ...args: unknown[]): void => this.log('info', message, ...args);
    warn = (message: string, ...args: unknown[]): void => this.log('warn', message, ...args);
    error = (message: string, ...args: unknown[]): void => this.log('error', message, ...args);
    fatal = (message: string, ...args: unknown[]): void => this.log('fatal', message, ...args);
}

export class CategoryLoggerProvider implements LoggerProvider {
    getLogger(category: string = 'default'): Logger {
        return new SharedCategoryLogger(category);
    }
}

export { CategoryLoggerProvider as Log4jsLoggerProvider };
