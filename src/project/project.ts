import { isArray } from 'util';
import { ProjectSource, SourceLike, SourceType } from './source';
import { GraphQLSchema } from 'graphql';
import { DEFAULT_LOGGER_PROVIDER, LoggerProvider } from '../config/global';
import { ValidationResult } from '../schema/preparation/ast-validator';
import { DatabaseAdapter } from '../database/database-adapter';
import { createSchema, validateSchema } from '../schema/schema-builder';

export interface ProjectOptions {
    /**
     * This namespace applies to all type operations for which no namespace is defined.
     */
    readonly defaultNamespace?: string

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
    readonly sources: ProjectSource[];

    /**
     * This namespace applies to all type operations for which no namespace is defined.
     */
    readonly defaultNamespace?: string;

    readonly loggerProvider: LoggerProvider;

    constructor(config: ProjectConfig|SourceLike[]) {
        if (isArray(config)) {
            config = { sources: config };
        }
        this.sources = config.sources.map(config => ProjectSource.fromConfig(config));
        this.defaultNamespace = config.defaultNamespace;
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

    /**
     * Creates an executable GraphQLSchema that uses the given DatabaseAdapter to execute queries
     */
    createSchema(databaseAdapter: DatabaseAdapter): GraphQLSchema {
        return createSchema(this, databaseAdapter);
    }
}
