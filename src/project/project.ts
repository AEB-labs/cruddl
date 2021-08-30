import { GraphQLSchema } from 'graphql';
import memorize from 'memorize-decorator';
import { ProjectOptions } from '../config/interfaces';
import { DEFAULT_LOGGER_PROVIDER, LoggerProvider } from '../config/logging';
import { TransactionError } from '../database/arangodb';
import { ERROR_RESOURCE_LIMIT } from '../database/arangodb/error-codes';
import { DatabaseAdapter } from '../database/database-adapter';
import { ExecutionOptions } from '../execution/execution-options';
import { SchemaExecutor } from '../execution/schema-executor';
import { getMetaSchema } from '../meta-schema/meta-schema';
import { Model, ValidationResult } from '../model';
import { TimeToLiveType } from '../model/implementation/time-to-live';
import { ListQueryNode, QueryNode } from '../query-tree';
import { createSchema, getModel, validateSchema } from '../schema/schema-builder';
import { ProjectSource, SourceLike, SourceType } from './source';
import { getQueryNodeForTTLType, getTTLInfoQueryNode, TTLInfo } from './time-to-live';

export { ProjectOptions };

export interface ProjectConfig extends ProjectOptions {
    /**
     * Array of source files
     *
     * The name of each source identifies its type, so files ending with .yaml are interpreted as YAML files
     */
    readonly sources: ReadonlyArray<SourceLike>;
}

export interface TTLCleanupResult {
    /**
     * Specifies if all objects to be deleted have been deleted despite possibly configured limits
     *
     * (could be false if exactly as many objects have been deleted as the configured limit)
     */
    readonly isComplete: boolean;

    /**
     * Specifies if there has been an error in one of the type executions
     */
    readonly hasErrors: boolean;

    readonly types: ReadonlyArray<TTLCleanupTypeResult>;
}

export interface TTLCleanupTypeResult {
    /**
     * The TTL type this is the result for
     */
    readonly type: TimeToLiveType;

    /**
     * The actual number of objects that have been deleted for this type
     */
    readonly deletedObjectsCount: number;

    /**
     * The limit used for object deletion.
     *
     * If hasReducedLimit is true, this is the reduced limit. If has been no limit, this is undefined.
     */
    readonly limit: number | undefined;

    /**
     * Specifies if the limit has been reduced to avoid resource errors
     *
     * Will always be false if reduceLimitOnResourceLimits is not set to true.
     */
    readonly hasReducedLimit: boolean;

    /**
     * Specifies if all objects to be deleted have been deleted despite possibly configured limits
     *
     * (could be false if exactly as many objects have been deleted as the configured limit)
     */
    readonly isComplete: boolean;

    /**
     * Specifies if an error occurred for this type
     */
    readonly hasError: boolean;

    /**
     * An error, if an error occurred for this type
     */
    readonly error: Error | undefined;

    /**
     * The last resource-exhaustion error that caused the limit to be reduce. The presence of this does not mean that the
     * operation failed, see error/hasError for this
     */
    readonly lastLimitReductionCause: Error | undefined;
}

export class Project {
    /**
     * Array of source files
     *
     * The name of each source identifies its type, so files ending with .yaml are interpreted as YAML files
     */
    readonly sources: ReadonlyArray<ProjectSource>;

    readonly loggerProvider: LoggerProvider;

    readonly options: ProjectOptions;

    constructor(config: ProjectConfig | SourceLike[]) {
        if (Array.isArray(config)) {
            config = { sources: config };
        }
        this.sources = config.sources.map(config => ProjectSource.fromConfig(config));
        this.loggerProvider = config.loggerProvider || DEFAULT_LOGGER_PROVIDER;
        this.options = {
            loggerProvider: config.loggerProvider,
            profileConsumer: config.profileConsumer,
            getExecutionOptions: config.getExecutionOptions,
            getOperationIdentifier: config.getOperationIdentifier,
            processError: config.processError,
            schemaOptions: config.schemaOptions,
            modelValidationOptions: config.modelValidationOptions,
            modelOptions: config.modelOptions
        };
    }

    getSourcesOfType(type: SourceType): ProjectSource[] {
        return this.sources.filter(source => source.type == type);
    }

    /**
     * Validates this project ot identify if createSchema() would succeed
     *
     * @return the result with all validation messages encountered
     */
    @memorize()
    validate(): ValidationResult {
        return validateSchema(this);
    }

    /**
     * Gets a structured representation of the elements of this project
     *
     * @throws InvalidProjectError if this project is invalid
     */
    @memorize()
    getModel(): Model {
        return getModel(this);
    }

    /**
     * Creates an executable GraphQLSchema that uses the given DatabaseAdapter to execute queries
     *
     * @throws InvalidProjectError if this project is invalid
     */
    createSchema(databaseAdapter: DatabaseAdapter): GraphQLSchema {
        return createSchema(this, databaseAdapter);
    }

    /**
     * Experimental API, lacks of significant features like validation or introspection
     *
     * @throws InvalidProjectError if this project is invalid
     */
    createSchemaExecutor(databaseAdapter: DatabaseAdapter): SchemaExecutor {
        return new SchemaExecutor(this, databaseAdapter);
    }

    /**
     * Creates an executable GraphQLSchema that allows to inspect the active model with its types and fields
     *
     * @throws InvalidProjectError if this project is invalid
     */
    @memorize()
    createMetaSchema(): GraphQLSchema {
        return getMetaSchema(this.getModel());
    }

    async executeTTLCleanup(
        databaseAdapter: DatabaseAdapter,
        executionOptions: ExecutionOptions
    ): Promise<{ [name: string]: number }> {
        const result = await this.executeTTLCleanupExt(databaseAdapter, executionOptions);
        const resultMap: Record<string, number> = {};
        for (const type of result.types) {
            if (type.error) {
                throw type.error;
            }

            if (type.type.rootEntityType) {
                resultMap[type.type.rootEntityType.name] = type.deletedObjectsCount;
            }
        }
        return resultMap;
    }

    async executeTTLCleanupExt(
        databaseAdapter: DatabaseAdapter,
        executionOptions: ExecutionOptions
    ): Promise<TTLCleanupResult> {
        const ttlTypes = this.getModel().rootEntityTypes.flatMap(rootEntityType => rootEntityType.timeToLiveTypes);
        const resultTypes: TTLCleanupTypeResult[] = [];
        for (const ttlType of ttlTypes) {
            resultTypes.push(await this.executeTTLCleanupForType(ttlType, databaseAdapter, executionOptions));
        }
        return {
            types: resultTypes,
            isComplete: resultTypes.every(t => t.isComplete),
            hasErrors: resultTypes.some(t => t.hasError)
        };
    }

    private async executeTTLCleanupForType(
        type: TimeToLiveType,
        databaseAdapter: DatabaseAdapter,
        executionOptions: ExecutionOptions
    ): Promise<TTLCleanupTypeResult> {
        let limit = executionOptions.timeToLiveOptions?.cleanupLimit ?? executionOptions.timeToLiveCleanupLimit;
        let hasReducedLimit = false;
        let lastLimitReductionCause: Error | undefined = undefined;
        while (true) {
            const queryTree = getQueryNodeForTTLType(type, limit);
            try {
                const deletedObjectsCount = await this.execute(databaseAdapter, queryTree, executionOptions);
                return {
                    type,
                    deletedObjectsCount,
                    hasReducedLimit,
                    lastLimitReductionCause,
                    hasError: false,
                    error: undefined,
                    limit,
                    isComplete: limit === undefined || deletedObjectsCount < limit
                };
            } catch (error) {
                if (
                    executionOptions.timeToLiveOptions?.reduceLimitOnResourceLimits &&
                    limit !== undefined &&
                    limit > 1
                ) {
                    if (error instanceof TransactionError && (error.cause as any).errorNum === ERROR_RESOURCE_LIMIT) {
                        limit = Math.floor(limit / 2);
                        hasReducedLimit = true;
                        lastLimitReductionCause = error;
                        continue;
                    }
                }
                return {
                    type,
                    deletedObjectsCount: 0,
                    hasReducedLimit,
                    lastLimitReductionCause,
                    hasError: true,
                    error,
                    limit,
                    isComplete: false
                };
            }
        }
    }

    async getTTLInfo(
        databaseAdapter: DatabaseAdapter,
        executionOptions: ExecutionOptions
    ): Promise<ReadonlyArray<TTLInfo>> {
        const ttlTypes = this.getModel().rootEntityTypes.flatMap(rootEntityType => rootEntityType.timeToLiveTypes);
        const queryTree = new ListQueryNode(
            ttlTypes.map(ttlType =>
                getTTLInfoQueryNode(
                    ttlType,
                    executionOptions.timeToLiveOptions?.overdueDelta || executionOptions.timeToLiveOverdueDelta || 3
                )
            )
        );
        return await this.execute(databaseAdapter, queryTree, executionOptions);
    }

    private async execute(databaseAdapter: DatabaseAdapter, queryTree: QueryNode, executionOptions: ExecutionOptions) {
        const res = databaseAdapter.executeExt
            ? await databaseAdapter.executeExt({
                  queryTree,
                  ...executionOptions
              })
            : {
                  data: databaseAdapter.execute(queryTree)
              };
        if (res.error) {
            throw res.error;
        }
        return res.data;
    }
}
