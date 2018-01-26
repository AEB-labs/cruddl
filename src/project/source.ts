/**
 * The type of a source file
 */
import { Source } from 'graphql';

const projectSourceLinkSymbol = Symbol('ProjectSource');

export enum SourceType {
    /**
     * A graphql schema definition file defining types
     */
    GRAPHQLS,

    /**
     * A metadata file in JSON format
     */
    JSON,

    /**
     * A metadata file in YAML format
     */
    YAML,
}

/**
 * A source file in a project
 */
export class ProjectSource {
    /**
     * The file type as derived from the name
     */
    public readonly type: SourceType;

    constructor(public readonly name: string, public readonly body: string, public readonly filePath: string|undefined = undefined) {
        if (typeof name != 'string' || !name) {
            throw new Error(`name must be a non-empty string, but is ${String(name)}`);
        }
        if (typeof body != 'string') {
            throw new Error(`body must be a string, but is ${String(body)}`);
        }
        this.type = getTypeFromName(name);
    }

    static fromConfig(config: SourceConfig|ProjectSource) {
        if (config instanceof ProjectSource) {
            return config;
        }
        return new ProjectSource(config.name, config.body);
    }

    toGraphQLSource(): Source {
        const source = new Source(this.body, this.name);
        (source as any)[projectSourceLinkSymbol] = this;
        return source;
    }

    static fromGraphQLSource(source: Source): ProjectSource|undefined {
        if (projectSourceLinkSymbol in source) {
            return (source as any)[projectSourceLinkSymbol];
        }
        return undefined;
    }
}

export interface SourceConfig {
    name: string
    body: string
}

export type SourceLike = SourceConfig|ProjectSource;

function getTypeFromName(name: string) {
    if (name.endsWith('.yaml') || name.endsWith('.yml')) {
        return SourceType.YAML;
    }
    if (name.endsWith('.json')) {
        return SourceType.JSON;
    }
    return SourceType.GRAPHQLS;
}
