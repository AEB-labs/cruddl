import { Database } from 'arangojs';
import { LoadBalancingStrategy } from 'arangojs/lib/cjs/connection';
import { globalContext, SchemaContext } from '../../config/global';
import { Logger } from '../../config/logging';
import { CustomDatabase } from './arangojs-instrumentation/custom-database';

export interface ArangoJSConfig {
    url?: string | string[];
    isAbsolute?: boolean;
    arangoVersion?: number;
    loadBalancingStrategy?: LoadBalancingStrategy;
    maxRetries?: false | number;
    agent?: any;
    agentOptions?: {
        [key: string]: any;
    };
    headers?: {
        [key: string]: string;
    };
}

export interface ArangoDBConfig {
    /**
     * Additional configuration options that will be passed to the ArangoJS Database constructor
     */
    readonly arangoJSConfig?: ArangoJSConfig

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

    /**
     * If set to true, the ArangoJS Connection class will be instrumented so that profiling information include timings
     * for queue wait time, response download etc.
     */
    readonly enableExperimentalArangoJSInstrumentation?: boolean

    /**
     * The memory limit in bytes to impose on ArangoDB queries (does not apply to the whole ArangoDB transaction).
     *
     * Can be overridden with the queryMemoryLimit option in ExecutionOptions
     */
    queryMemoryLimit?: number
}

export function initDatabase(config: ArangoDBConfig): Database {
    const clazz = config.enableExperimentalArangoJSInstrumentation ? CustomDatabase : Database;
    const db = new clazz({
        ...(config.arangoJSConfig ? config.arangoJSConfig : {}),
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
