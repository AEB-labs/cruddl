import { getLogger } from 'log4js';
import { Logger, LoggerProvider } from '../../src/config/logging';

export class Log4jsLoggerProvider implements LoggerProvider {
    constructor(
        public readonly level: string,
        public readonly levelByCategory: { [category: string]: string } = {},
    ) {}

    getLogger(category: string): Logger {
        const logger = getLogger(category);
        logger.level =
            category in this.levelByCategory ? this.levelByCategory[category] : this.level;
        return logger;
    }
}
