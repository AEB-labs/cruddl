import {DocumentNode, Source} from "graphql";

export interface SchemaConfig {
    /**
     * This namespace applies to all type operations for which no namespace is defined.
     */
    readonly defaultNamespace?: string
    readonly schemaParts: SchemaPartConfig[]
}

export interface SchemaPartConfig {
    readonly localNamespace?: string
    readonly source: Source | DocumentNode
}