import type { DocumentNode } from 'graphql';
import type { MessageLocation } from '../../model/validation/location.js';
import type { PlainObject } from '../../utils/utils.js';

export interface ParsedProject {
    readonly sources: ReadonlyArray<ParsedProjectSource>;
}

export type ParsedProjectSource = ParsedGraphQLProjectSource | ParsedObjectProjectSource;

export interface ParsedProjectSourceBase {
    readonly kind: ParsedProjectSourceBaseKind;
    readonly namespacePath: ReadonlyArray<string>;
}

export interface ParsedGraphQLProjectSource extends ParsedProjectSourceBase {
    readonly kind: ParsedProjectSourceBaseKind.GRAPHQL;
    readonly document: DocumentNode;
}

export interface ParsedObjectProjectSource extends ParsedProjectSourceBase {
    readonly kind: ParsedProjectSourceBaseKind.OBJECT;
    readonly object: PlainObject;
    readonly pathLocationMap: { [path: string]: MessageLocation };
}

export type PathLocationMap = { readonly [path: string]: MessageLocation };

export enum ParsedProjectSourceBaseKind {
    GRAPHQL = 'graphql',
    OBJECT = 'object',
}
