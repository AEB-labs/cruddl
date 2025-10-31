import { getLogger } from 'log4js';
import { Logger, LoggerProvider } from '../../src/config/logging';

export class Log4jsLoggerProvider implements LoggerProvider {
    getLogger(category: string): Logger {
        // note: we used to change the level here, but that does not work because in log4js,
        // everything is global state (you're actually changing a category's level globally if you
        // set .level on a logger)
        return getLogger(category);
    }
}
