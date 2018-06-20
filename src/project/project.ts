import { GraphQLSchema } from 'graphql';
import { isArray } from 'util';
import { DEFAULT_LOGGER_PROVIDER, LoggerProvider } from '../config/logging';
import { DatabaseAdapter } from '../database/database-adapter';
import { getMetaSchema } from '../meta-schema/meta-schema';
import { Model, ValidationResult } from '../model';
import { createSchema, getModel, validateSchema } from '../schema/schema-builder';
import { ProjectSource, SourceLike, SourceType } from './source';

export interface ProjectOptions {
    /**
     * This namespace applies to all type operations for which no namespace is defined.
     */
    readonly loggerProvider?: LoggerProvider;
}

export interface ProjectConfig extends ProjectOptions {
    /**
     * Array of source files
     *
     * The name of each source identifies its type, so files ending with .yaml are interpreted as YAML files
     */
    sources: SourceLike[]
}

export class Project {
    /**
     * Array of source files
     *
     * The name of each source identifies its type, so files ending with .yaml are interpreted as YAML files
     */
    readonly sources: ReadonlyArray<ProjectSource>;

    readonly loggerProvider: LoggerProvider;

    constructor(config: ProjectConfig|SourceLike[]) {
        if (isArray(config)) {
            config = { sources: config };
        }
        this.sources = config.sources.map(config => ProjectSource.fromConfig(config));
        this.loggerProvider = config.loggerProvider || DEFAULT_LOGGER_PROVIDER;
    }

    getSourcesOfType(type: SourceType): ProjectSource[] {
        return this.sources.filter(source => source.type == type);
    }

    /**
     * Validates this project ot identify if createSchema() would succeed
     */
    validate(): ValidationResult {
        return validateSchema(this);
    }

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
     * Creates an executable GraphQLSchema that allows to inspect the active model with its types and fields
     */
    createMetaSchema(): GraphQLSchema {
        return getMetaSchema(this.getModel());
    }
}
