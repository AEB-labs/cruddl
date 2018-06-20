import { DocumentNode } from 'graphql';
import { PlainObject } from '../utils/utils';

export interface ParsedProject {
    readonly sources: ReadonlyArray<ParsedProjectSource>
}

export type ParsedProjectSource = ParsedGraphQLProjectSource | ParsedObjectProjectSource

export interface ParsedProjectSourceBase {
    readonly kind: ParsedProjectSourceBaseKind
    readonly namespacePath: ReadonlyArray<string>;
}

export interface ParsedGraphQLProjectSource extends ParsedProjectSourceBase {
    readonly kind: ParsedProjectSourceBaseKind.GRAPHQL
    readonly document: DocumentNode
}

export interface ParsedObjectProjectSource extends ParsedProjectSourceBase {
    readonly kind: ParsedProjectSourceBaseKind.OBJECT
    readonly object: PlainObject
}

export enum ParsedProjectSourceBaseKind {
    GRAPHQL = "graphql",
    OBJECT = "object"
}