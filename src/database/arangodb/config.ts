import { Database } from 'arangojs';
import { globalContext, SchemaContext } from '../../config/global';
import { Logger } from '../../config/logging';

export interface ArangoDBConfig {
    readonly url: string;
    readonly user?: string;
    readonly password?: string;
    readonly databaseName: string;

    /**
     * Specifies if indices defined in the model should be created in updateSchema(). Defaults to true.
     */
    readonly autocreateIndices?: boolean;

    /**
     * Specifies if indices that are not defined in the model (but are on collections of root entities defined in the
     * model) should be removed in updateSchema(). Defaults to true.
     */
    readonly autoremoveIndices?: boolean;
}

export function initDatabase(config: ArangoDBConfig): Database {
    const db = new Database({
        url: config.url
    }).useDatabase(config.databaseName);
    if (config.user) {
        // Unfortunately the typings of arangojs do not include the method "useBasicAuth" although it is present in the implementation of arangojs.
        // Therefore we cast to any
        (db as any).useBasicAuth(config.user, config.password);
    }
    return db;
}

export function getArangoDBLogger(schemaContext: SchemaContext | undefined): Logger {
    globalContext.registerContext(schemaContext);
    try {
        return globalContext.loggerProvider.getLogger('ArangoDBAdapter');
    } finally {
        globalContext.unregisterContext();
    }
}
