/**
 * The type of a source file
 */
export enum SourceType {
    /**
     * A graphql schema definition file defining types
     */
    GRAPHQLS,

    /**
     * A metadata file in YAML format
     */
    YAML
}

/**
 * A source file in a project
 */
export class ProjectSource {
    /**
     * The file type as derived from the name
     */
    public readonly type: SourceType;

    constructor(public readonly name: string, public readonly body: string) {
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
}

export interface SourceConfig {
    name: string
    body: string
}

export type SourceLike = SourceConfig|ProjectSource;

function getTypeFromName(name: string) {
    if (name.endsWith('.yaml') || name.endsWith('.yml') || name.endsWith('.json')) {
        return SourceType.YAML;
    }
    return SourceType.GRAPHQLS;
}
