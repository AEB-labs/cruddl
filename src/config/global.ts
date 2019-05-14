import { SchemaContext } from './interfaces';
import { DEFAULT_LOGGER_PROVIDER, LoggerProvider } from './logging';

export namespace globalContext {
    export let loggerProvider: LoggerProvider;

    /**
     * Restores default values in the global context
     */
    export function unregisterContext() {
        loggerProvider = DEFAULT_LOGGER_PROVIDER;
    }

    /**
     * Resets the global context and applies values of a given schema context
     */
    export function registerContext(context: SchemaContext | undefined) {
        unregisterContext();
        if (context && context.loggerProvider) {
            loggerProvider = context.loggerProvider;
        }
    }

    // init
    unregisterContext();
}
