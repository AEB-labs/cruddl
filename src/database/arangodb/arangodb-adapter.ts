import { Database } from 'arangojs';
import { GraphQLError } from 'graphql';
import { globalContext, SchemaContext } from '../../config/global';
import { Logger } from '../../config/logging';
import { ExecutionOptions } from '../../execution/execution-options';
import { Model } from '../../model';
import { ALL_QUERY_RESULT_VALIDATOR_FUNCTION_PROVIDERS, QueryNode } from '../../query-tree';
import { objectValues, sleepInterruptible } from '../../utils/utils';
import { getPreciseTime, Watch } from '../../utils/watch';
import { DatabaseAdapter, DatabaseAdapterTimings, ExecutionArgs, ExecutionPlan, ExecutionResult } from '../database-adapter';
import { AQLCompoundQuery, aqlConfig, AQLExecutableQuery } from './aql';
import { getAQLQuery } from './aql-generator';
import { RequestInstrumentation, RequestInstrumentationPhase } from './arangojs-instrumentation/config';
import { ArangoDBConfig, DEFAULT_RETRY_DELAY_BASE_MS, getArangoDBLogger, initDatabase } from './config';
import { ERROR_ARANGO_CONFLICT } from './error-codes';
import { SchemaAnalyzer } from './schema-migration/anaylzer';
import { SchemaMigration } from './schema-migration/migrations';
import { MigrationPerformer } from './schema-migration/performer';

const requestInstrumentationBodyKey = 'cruddlRequestInstrumentation';

interface ArangoExecutionOptions {
    readonly queries: ReadonlyArray<AQLExecutableQuery>
    readonly options: ExecutionOptions
}

interface ArangoError extends Error {
    readonly errorNum?: number
    readonly errorMessage?: string
}

interface ArangoTransactionResult {
    readonly data?: any
    readonly error?: ArangoError;
    readonly timings?: { readonly [key: string]: number };
    readonly plans?: ReadonlyArray<any>
}

interface TransactionResult {
    readonly data?: any
    readonly timings?: Pick<DatabaseAdapterTimings, 'database' | 'dbConnection'>
    readonly plans?: ReadonlyArray<any>
    readonly databaseError?: ArangoError;
}

export class ArangoDBAdapter implements DatabaseAdapter {
    private readonly db: Database;
    private readonly logger: Logger;
    private readonly analyzer: SchemaAnalyzer;
    private readonly migrationPerformer: MigrationPerformer;
    private readonly autocreateIndices: boolean;
    private readonly autoremoveIndices: boolean;
    private readonly arangoExecutionFunction: string;

    constructor(private readonly config: ArangoDBConfig, private schemaContext?: SchemaContext) {
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
        const arangoExecutionFunction = function ({ queries, options }: ArangoExecutionOptions) {
            const db = require('@arangodb').db;
            const enableProfiling = options.recordTimings;
            const internal = enableProfiling ? require('internal') : undefined;

            function getPreciseTime() {
                return internal.time();
            }

            const startTime = enableProfiling ? getPreciseTime() : 0;

            let validators: { [name: string]: (validationData: any, result: any) => void } = {};
            //inject_validators_here

            let timings: { [key: string]: number } | undefined = enableProfiling ? {} : undefined;
            let timingsTotal = 0;

            let plans: any[] = [];

            let resultHolder: { [p: string]: any } = {};
            for (const query of queries) {
                const bindVars = query.boundValues;
                for (const key in query.usedPreExecResultNames) {
                    bindVars[query.usedPreExecResultNames[key]] = resultHolder[key];
                }

                let explainResult;
                if (options.recordPlan) {
                    const stmt = db._createStatement({
                        query: query.code,
                        bindVars
                    });
                    explainResult = stmt.explain({ allPlans: true });
                }

                // Execute the AQL query
                let executionResult;
                try {
                    executionResult = db._query({
                        query: query.code,
                        bindVars,
                        options: {
                            profile: options.recordPlan ? 2 : options.recordTimings ? 1 : 0,
                            memoryLimit: options.queryMemoryLimit
                        }
                    });
                } catch (error) {
                    if (explainResult) {
                        plans.push({
                            plan: explainResult.plans[0],
                            discardedPlans: explainResult.plans.slice(1),
                            warnings: explainResult.warnings
                        });
                    }

                    if (enableProfiling && timings) {
                        timings.js = (getPreciseTime() - startTime) - timingsTotal;
                    }

                    return {
                        error,
                        timings,
                        plans
                    };
                }

                const resultData = executionResult.next();

                if (timings) {
                    let profile = executionResult.getExtra().profile;
                    for (let key in profile) {
                        if (profile.hasOwnProperty(key)) {
                            timings[key] = (timings[key] || 0) + profile[key];
                            timingsTotal += profile[key];
                        }
                    }
                }

                if (options.recordPlan) {
                    const extra = executionResult.getExtra();
                    plans.push({
                        plan: extra.plan,
                        discardedPlans: explainResult ? explainResult.plans.slice(1) : [],
                        stats: extra.stats,
                        warnings: extra.warnings,
                        profile: extra.profile
                    });
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
            }

            // the last query is always the main query, use its result as result of the transaction
            const lastQueryResultName = queries[queries.length - 1].resultName;
            let data;
            if (lastQueryResultName) {
                data = resultHolder[lastQueryResultName];
            } else {
                data = undefined;
            }

            if (enableProfiling && timings) {
                timings.js = (getPreciseTime() - startTime) - timingsTotal;
            }

            const transactionResult = {
                data,
                timings,
                plans
            };

            if (options.mutationMode === 'rollback') {
                const error = new Error(`${JSON.stringify(transactionResult)}`);
                error.name = 'RolledBackTransactionError';
                throw error;
            }

            return transactionResult;
        };

        const validatorProviders = ALL_QUERY_RESULT_VALIDATOR_FUNCTION_PROVIDERS.map(provider =>
            `[${JSON.stringify(provider.getValidatorName())}]: ${String(provider.getValidatorFunction())}`);

        const allValidatorFunctionsObjectString = `validators = {${validatorProviders.join(',\n')}}`;

        return String(arangoExecutionFunction)
            .replace('//inject_validators_here', allValidatorFunctionsObjectString);
    }

    async execute(queryTree: QueryNode) {
        const result = await this.executeExt({ queryTree });
        if (result.errors && result.errors.length) {
            throw result.errors[0];
        }
        return result.data;
    }

    async executeExt({ queryTree, ...options }: ExecutionArgs): Promise<ExecutionResult> {
        const prepStartTime = getPreciseTime();
        globalContext.registerContext(this.schemaContext);
        let executableQueries: AQLExecutableQuery[];
        let aqlQuery: AQLCompoundQuery;
        const oldEnableIndentationForCode = aqlConfig.enableIndentationForCode;
        const oldOptimizationConfig = aqlConfig.optimizationConfig;
        aqlConfig.enableIndentationForCode = !!options.recordPlan;
        aqlConfig.optimizationConfig = {
            enableExperimentalProjectionIndirection: this.config.enableExperimentalProjectionIndirection,
            experimentalProjectionIndirectionTypeNames: this.config.experimentalProjectionIndirectionTypeNames
        };
        try {
            //TODO Execute single statement AQL queries directly without "db.transaction"?
            aqlQuery = getAQLQuery(queryTree);
            executableQueries = aqlQuery.getExecutableQueries();
        } finally {
            globalContext.unregisterContext();
            aqlConfig.enableIndentationForCode = oldEnableIndentationForCode;
            aqlConfig.optimizationConfig = oldOptimizationConfig;
        }
        if (this.logger.isTraceEnabled()) {
            this.logger.trace(`Executing AQL: ${aqlQuery.toColoredString()}`);
        }
        const aqlPreparationTime = getPreciseTime() - prepStartTime;
        const { databaseError, timings: transactionTimings, data, plans } = await this.executeTransactionWithRetries(executableQueries, options, aqlQuery);

        let timings;
        if (options.recordTimings && transactionTimings) {
            timings = {
                ...transactionTimings,
                preparation: {
                    total: aqlPreparationTime,
                    aql: aqlPreparationTime
                }
            };
        }

        let plan: ExecutionPlan | undefined;
        if (options.recordPlan && plans) {
            plan = {
                queryTree,
                transactionSteps: executableQueries.map((q, index) => ({
                    query: q.code,
                    boundValues: q.boundValues,
                    plan: plans[index] && plans[index].plan,
                    discardedPlans: plans[index] && plans[index].discardedPlans,
                    stats: plans[index] && plans[index].stats,
                    warnings: plans[index] && plans[index].warnings,
                    profile: plans[index] && plans[index].profile
                }))
            };
        }

        let errors: ReadonlyArray<GraphQLError> | undefined;
        if (databaseError) {
            const arangoDBCode: number | undefined = databaseError.errorNum;
            const extensions: { [key: string]: any } = {
                arangoDBCode
            };
            const message = databaseError.errorMessage || databaseError.message;
            errors = [
                new GraphQLError(message, undefined, undefined, undefined, undefined, undefined, extensions)
            ];
        }

        return {
            errors,
            data,
            timings,
            plan
        };
    }

    private async executeTransactionWithRetries(executableQueries: ReadonlyArray<AQLExecutableQuery>, options: ExecutionOptions, aqlQuery: AQLCompoundQuery): Promise<TransactionResult> {
        const maxRetries = this.config.retriesOnConflict || 0;
        let nextRetryDelay = 0;
        let tries = 0;
        let result;
        // timings need to be added up
        let timings: TransactionResult['timings'] | undefined;

        while (true) {
            result = await this.executeTransactionOnce(executableQueries, options, aqlQuery);

            if (options.recordTimings && result.timings) {
                timings = {
                    database: sumUpValues([timings ? timings.database : {}, result.timings.database]),
                    dbConnection: sumUpValues([timings ? timings.dbConnection : {}, result.timings.dbConnection])
                } as TransactionResult['timings'];
            }

            if (tries >= maxRetries || !result.databaseError || !this.isRetryableError(result.databaseError)) {
                return { ...result, timings };
            }

            const sleepStart = getPreciseTime();
            const shouldContinue = await sleepInterruptible(nextRetryDelay, options.cancellationToken);
            if (options.recordTimings && timings) {
                const sleepLength = getPreciseTime() - sleepStart;
                timings = {
                    ...timings,
                    dbConnection: sumUpValues([timings.dbConnection, { retryDelay: sleepLength, total: sleepLength }])
                } as TransactionResult['timings'];
            }
            if (!shouldContinue) {
                // cancellation token fired before the sleep time was over
                // we already have a result with an error, so it's probably better to return that instead of a generic "cancelled"
                // probably doesn't matter anyway because the caller probably is no longer interested in the result
                return { ...result, timings };
            }

            if (nextRetryDelay) {
                nextRetryDelay *= 2;
            } else {
                nextRetryDelay = this.config.retryDelayBaseMs || DEFAULT_RETRY_DELAY_BASE_MS;
            }
            tries++;
        }
    }

    private isRetryableError(error: ArangoError): boolean {
        return error.errorNum === ERROR_ARANGO_CONFLICT;
    }

    private async executeTransactionOnce(executableQueries: ReadonlyArray<AQLExecutableQuery>, options: ExecutionOptions, aqlQuery: AQLCompoundQuery): Promise<TransactionResult> {
        const args: ArangoExecutionOptions = {
            queries: executableQueries,
            options: {
                ...options,
                queryMemoryLimit: options.queryMemoryLimit || this.config.queryMemoryLimit
            }
        };
        const watch = new Watch();
        if (this.config.enableExperimentalArangoJSInstrumentation) {
            (args as any)[requestInstrumentationBodyKey] = {
                onPhaseEnded: (phase: RequestInstrumentationPhase) => {
                    watch.stop(phase);
                },
                cancellationToken: options.cancellationToken
            } as RequestInstrumentation;
        }

        const dbStartTime = getPreciseTime();
        let transactionResult: ArangoTransactionResult;
        try {
            transactionResult = await this.db.transaction(
                {
                    read: aqlQuery.readAccessedCollections,
                    write: aqlQuery.writeAccessedCollections
                },
                this.arangoExecutionFunction,
                args
            );
        } catch (e) {
            if (options.mutationMode === 'rollback' && e.message.startsWith('RolledBackTransactionError: ')) {
                const valStr = e.message.substr('RolledBackTransactionError: '.length);
                try {
                    transactionResult = JSON.parse(valStr);
                } catch (eParse) {
                    throw new Error(`Error parsing result of rolled back transaction`);
                }
            } else {
                throw e;
            }
        }
        const { timings: databaseReportedTimings, data, plans, error: databaseError } = transactionResult;

        let timings;
        if (options.recordTimings && databaseReportedTimings) {
            const dbConnectionTotal = getPreciseTime() - dbStartTime;
            const queuing = watch.timings.queuing;
            const socketInit = watch.timings.socketInit || 0;
            const lookup = watch.timings.lookup || 0;
            const connecting = watch.timings.connecting || 0;
            const receiving = watch.timings.receiving;
            const waiting = watch.timings.waiting;
            const other = watch.timings.total - queuing - socketInit - lookup - connecting - receiving - waiting;
            const dbInternalTotal = objectValues<number>(databaseReportedTimings).reduce((a, b) => a + b, 0);
            timings = {
                dbConnection: {
                    queuing,
                    socketInit,
                    lookup,
                    connecting,
                    waiting,
                    receiving,
                    other,
                    total: dbConnectionTotal
                },
                database: {
                    ...databaseReportedTimings,
                    total: dbInternalTotal
                }
            };
        }

        return { timings, data, plans, databaseError };
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
        } catch (e) {
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

function sumUpValues(objects: ReadonlyArray<{ readonly [key: string]: number }>): { readonly [key: string]: number } {
    const result: { [key: string]: number } = {};
    for (const obj of objects) {
        for (const key of Object.keys(obj)) {
            if (Number.isFinite(obj[key])) {
                if (key in result && Number.isFinite(result[key])) {
                    result[key] += obj[key];
                } else {
                    result[key] = obj[key];
                }
            }
        }
    }
    return result;
}
