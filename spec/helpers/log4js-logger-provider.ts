import { getLogger } from 'log4js';
import { Logger, LoggerProvider } from '../../src/config/global';

export class Log4jsLoggerProvider implements LoggerProvider {
    constructor(public readonly level: string) {}

    getLogger(category: string): Logger {
        const logger = getLogger(category);
        logger.level = this.level;
        return logger;
    }
}
