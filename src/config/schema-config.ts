import { DocumentNode } from 'graphql';
import { PermissionProfileConfigMap } from '../model';

export interface SchemaConfig {
    /**
     * This namespace applies to all type operations for which no namespace is defined.
     */
    readonly defaultNamespace?: string
    readonly schemaParts: SchemaPartConfig[]
    readonly permissionProfiles?: PermissionProfileConfigMap
}

export interface SchemaPartConfig {
    readonly localNamespace?: string
    readonly document: DocumentNode
}
