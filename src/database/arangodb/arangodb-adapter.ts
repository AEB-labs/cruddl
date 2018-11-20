import { Database } from 'arangojs';
import { globalContext, SchemaContext } from '../../config/global';
import { Logger } from '../../config/logging';
import { Model } from '../../model';
import { ALL_QUERY_RESULT_VALIDATOR_FUNCTION_PROVIDERS, QueryNode } from '../../query-tree';
import { getPreciseTime } from '../../utils/watch';
import { DatabaseAdapter, ExecutionOptions, ExecutionResult } from '../database-adapter';
import { AQLCompoundQuery, AQLExecutableQuery } from './aql';
import { getAQLQuery } from './aql-generator';
import { getArangoDBLogger, initDatabase } from './config';
import { SchemaAnalyzer } from './schema-migration/anaylzer';
import { SchemaMigration } from './schema-migration/migrations';
import { MigrationPerformer } from './schema-migration/performer';

export const DEFAULT_INDEX_TYPE = 'persistent'; // persistent is a skiplist index

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

interface ArangoExecutionOptions {
    readonly queries: ReadonlyArray<AQLExecutableQuery>
    readonly enableProfiling: boolean
}

export class ArangoDBAdapter implements DatabaseAdapter {
    private readonly db: Database;
    private readonly logger: Logger;
    private readonly analyzer: SchemaAnalyzer;
    private readonly migrationPerformer: MigrationPerformer;
    private readonly autocreateIndices: boolean;
    private readonly autoremoveIndices: boolean;
    private readonly arangoExecutionFunction: string;

    constructor(config: ArangoDBConfig, private schemaContext?: SchemaContext) {
        this.logger = getArangoDBLogger(schemaContext);
        this.db = initDatabase(config);
        this.analyzer = new SchemaAnalyzer(config, schemaContext);
        this.migrationPerformer = new MigrationPerformer(config);
        this.arangoExecutionFunction = this.buildUpArangoExecutionFunction();
        this.autocreateIndices = config.autocreateIndices !== false; // defaults to true
        this.autoremoveIndices = config.autoremoveIndices !== false; // defaults to true
    }

    /**
     * Gets the javascript source code for a function that executes a transaction
     * @returns {string}
     */
    private buildUpArangoExecutionFunction(): string {

        // The following function will be translated to a string and executed (as one transaction) within the
        // ArangoDB server itself. Therefore the next comment is necessary to instruct our test coverage tool
        // (https://github.com/istanbuljs/nyc) not to instrument the code with coverage instructions.

        /* istanbul ignore next */
        const arangoExecutionFunction = function ({queries, enableProfiling}: ArangoExecutionOptions) {
            const db = require('@arangodb').db;

            let validators: { [name: string]: (validationData: any, result: any) => void } = {};
            //inject_validators_here

            let timings: {[key: string]: number}|undefined = enableProfiling ? {} : undefined;

            let resultHolder: { [p: string]: any } = {};
            queries.forEach(query => {
                const bindVars = query.boundValues;
                for (const key in query.usedPreExecResultNames) {
                    bindVars[query.usedPreExecResultNames[key]] = resultHolder[key];
                }

                // Execute the AQL query
                const executionResult = db._query({
                    query: query.code,
                    bindVars,
                    options: {
                        profile: enableProfiling
                    }
                });

                const resultData = executionResult.next();

                if (timings) {
                    let profile = executionResult.getExtra().profile;
                    for (let key in profile) {
                        if (profile.hasOwnProperty(key)) {
                            timings[key] = (timings[key] || 0) + profile[key];
                        }
                    }
                }

                if (query.resultName) {
                    resultHolder[query.resultName] = resultData;
                }

                if (query.resultValidator) {
                    for (const key in query.resultValidator) {
                        if (key in validators) {
                            validators[key](query.resultValidator[key], resultData);
                        }
                    }
                }
            });

            // the last query is always the main query, use its result as result of the transaction
            const lastQueryResultName = queries[queries.length - 1].resultName;
            let data;
            if (lastQueryResultName) {
                data = resultHolder[lastQueryResultName];
            } else {
                data = undefined;
            }
            return {
                data,
                timings
            };
        };

        const validatorProviders = ALL_QUERY_RESULT_VALIDATOR_FUNCTION_PROVIDERS.map(provider =>
            `[${JSON.stringify(provider.getValidatorName())}]: ${String(provider.getValidatorFunction())}`);

        const allValidatorFunctionsObjectString = `validators = {${validatorProviders.join(',\n')}}`;

        return String(arangoExecutionFunction)
            .replace('//inject_validators_here', allValidatorFunctionsObjectString);
    }

    async execute(queryTree: QueryNode) {
        const result = await this.executeExt({queryTree});
        return result.data;
    }

    async executeExt({queryTree, recordTimings = false}: ExecutionOptions): Promise<ExecutionResult> {
        const prepStartTime = getPreciseTime();
        globalContext.registerContext(this.schemaContext);
        let executableQueries: AQLExecutableQuery[];
        let aqlQuery: AQLCompoundQuery;
        try {
            //TODO Execute single statement AQL queries directly without "db.transaction"?
            aqlQuery = getAQLQuery(queryTree);
            executableQueries = aqlQuery.getExecutableQueries();
        } finally {
            globalContext.unregisterContext();
        }
        if (this.logger.isTraceEnabled()) {
            this.logger.trace(`Executing AQL: ${aqlQuery.toColoredString()}`);
        }
        const aqlPreparationTime = getPreciseTime() - prepStartTime;
        const dbStartTime = getPreciseTime();

        const options: ArangoExecutionOptions = {
            queries: executableQueries,
            enableProfiling: recordTimings
        };

        const { timings: databaseTimings, data } = await this.db.transaction(
            {
                read: aqlQuery.readAccessedCollections,
                write: aqlQuery.writeAccessedCollections
            },
            this.arangoExecutionFunction,
            options
        );

        let timings;
        if (recordTimings) {
            const dbTotal = getPreciseTime() - dbStartTime;
            timings = {
                database: {
                    ...databaseTimings,
                    total: dbTotal
                },
                preparation: {
                    total: aqlPreparationTime,
                    aql: aqlPreparationTime
                }
            };
        }
        return {
            data,
            timings
        };
    }

    /**
     * Compares the model with the database and determines migrations to do
     */
    async getOutstandingMigrations(model: Model): Promise<ReadonlyArray<SchemaMigration>> {
        return this.analyzer.getOutstandingMigrations(model);
    }

    /**
     * Performs a single mutation
     */
    async performMigration(migration: SchemaMigration): Promise<void> {
        this.logger.info(`Performing migration "${migration.description}"`);
        try {
            await this.migrationPerformer.performMigration(migration);
            this.logger.info(`Successfully performed migration "${migration.description}"`);
        } catch(e) {
            this.logger.error(`Error performing migration "${migration.description}": ${e.stack}`);
            throw e;
        }
    }

    /**
     * Performs schema migration as configured with autocreateIndices/autoremoveIndices
     */
    async updateSchema(model: Model): Promise<void> {
        const migrations = await this.getOutstandingMigrations(model);
        for (const migration of migrations) {
            if (migration.type === 'createIndex' && !this.autocreateIndices || migration.type === 'dropIndex' && !this.autoremoveIndices) {
                this.logger.info(`Skipping migration "${migration.description}" because of configuration`);
                continue;
            }
            await this.performMigration(migration);
        }
    }
}
