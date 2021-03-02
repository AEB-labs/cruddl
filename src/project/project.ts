import { GraphQLSchema } from 'graphql';
import memorize from 'memorize-decorator';
import { ProjectOptions } from '../config/interfaces';
import { DEFAULT_LOGGER_PROVIDER, LoggerProvider } from '../config/logging';
import { DatabaseAdapter } from '../database/database-adapter';
import { ExecutionOptions } from '../execution/execution-options';
import { SchemaExecutor } from '../execution/schema-executor';
import { getMetaSchema } from '../meta-schema/meta-schema';
import { Model, ValidationResult } from '../model';
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
            modelValidationOptions: config.modelValidationOptions
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
        const ttlTypes = this.getModel().rootEntityTypes.flatMap(rootEntityType => rootEntityType.timeToLiveTypes);
        const deletedObjects: { [name: string]: number } = {};
        for (const ttlType of ttlTypes) {
            const queryTree = getQueryNodeForTTLType(ttlType, executionOptions);
            const data = await this.execute(databaseAdapter, queryTree, executionOptions);
            deletedObjects[(ttlType.rootEntityType && ttlType.rootEntityType.name) || ''] = data || 0;
        }
        return deletedObjects;
    }

    async getTTLInfo(
        databaseAdapter: DatabaseAdapter,
        executionOptions: ExecutionOptions
    ): Promise<ReadonlyArray<TTLInfo>> {
        const ttlTypes = this.getModel().rootEntityTypes.flatMap(rootEntityType => rootEntityType.timeToLiveTypes);
        const queryTree = new ListQueryNode(
            ttlTypes.map(ttlType => getTTLInfoQueryNode(ttlType, executionOptions.timeToLiveOverdueDelta || 3))
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
