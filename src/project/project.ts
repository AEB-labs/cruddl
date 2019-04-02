import { FragmentDefinitionNode, GraphQLSchema, OperationDefinitionNode } from 'graphql';
import memorize from 'memorize-decorator';
import { isArray } from 'util';
import { DEFAULT_LOGGER_PROVIDER, LoggerProvider } from '../config/logging';
import { DatabaseAdapter, DatabaseAdapterTimings, ExecutionPlan, TransactionStats } from '../database/database-adapter';
import { ExecutionOptions, ExecutionOptionsCallbackArgs } from '../execution/execution-options';
import { SchemaExecutor } from '../execution/schema-executor';
import { getMetaSchema } from '../meta-schema/meta-schema';
import { Model, ValidationResult } from '../model';
import { createSchema, getModel, validateSchema } from '../schema/schema-builder';
import { ProjectSource, SourceLike, SourceType } from './source';

export interface RequestProfile {
    readonly timings?: DatabaseAdapterTimings;
    readonly stats: TransactionStats
    readonly plan?: ExecutionPlan;
    readonly operation: OperationDefinitionNode;
    readonly variableValues: { readonly [name: string]: unknown }
    readonly fragments: { readonly [fragmentName: string]: FragmentDefinitionNode }
    readonly context: unknown;
}

export interface ProjectOptions {
    readonly loggerProvider?: LoggerProvider;

    readonly profileConsumer?: (profile: RequestProfile) => void;

    readonly getExecutionOptions?: (args: ExecutionOptionsCallbackArgs) => ExecutionOptions;
}

export interface ProjectConfig extends ProjectOptions {
    /**
     * Array of source files
     *
     * The name of each source identifies its type, so files ending with .yaml are interpreted as YAML files
     */
    readonly sources: ReadonlyArray<SourceLike>
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
        if (isArray(config)) {
            config = { sources: config };
        }
        this.sources = config.sources.map(config => ProjectSource.fromConfig(config));
        this.loggerProvider = config.loggerProvider || DEFAULT_LOGGER_PROVIDER;
        this.options = {
            loggerProvider: config.loggerProvider,
            profileConsumer: config.profileConsumer,
            getExecutionOptions: config.getExecutionOptions
        };
    }

    getSourcesOfType(type: SourceType): ProjectSource[] {
        return this.sources.filter(source => source.type == type);
    }

    /**
     * Validates this project ot identify if createSchema() would succeed
     */
    @memorize()
    validate(): ValidationResult {
        return validateSchema(this);
    }

    @memorize()
    getModel(): Model {
        return getModel(this);
    }

    /**
     * Creates an executable GraphQLSchema that uses the given DatabaseAdapter to execute queries
     */
    createSchema(databaseAdapter: DatabaseAdapter): GraphQLSchema {
        return createSchema(this, databaseAdapter);
    }

    /**
     * Experimental API, lacks of significant features like validation or introspection
     */
    createSchemaExecutor(databaseAdapter: DatabaseAdapter): SchemaExecutor {
        return new SchemaExecutor(this, databaseAdapter);
    }

    /**
     * Creates an executable GraphQLSchema that allows to inspect the active model with its types and fields
     */
    @memorize()
    createMetaSchema(): GraphQLSchema {
        return getMetaSchema(this.getModel());
    }
}
