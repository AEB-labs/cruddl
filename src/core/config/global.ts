import { DEFAULT_LOGGER_PROVIDER } from './console-logger.js';
import type { ProjectOptions } from './interfaces.js';
import type { LoggerProvider } from './logging.js';

class GlobalContext {
    loggerProvider: LoggerProvider = DEFAULT_LOGGER_PROVIDER;

    /**
     * Restores default values in the global context
     */
    unregisterContext() {
        this.loggerProvider = DEFAULT_LOGGER_PROVIDER;
    }

    /**
     * Resets the global context and applies values of a given schema context
     */
    registerContext(context: ProjectOptions | undefined) {
        this.unregisterContext();
        if (context && context.loggerProvider) {
            this.loggerProvider = context.loggerProvider;
        }
    }
}

export const globalContext = new GlobalContext();
