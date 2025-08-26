import {
    Document,
    isDocument,
    isMap,
    isPair,
    isScalar,
    Pair,
    parseDocument,
    Scalar,
    YAMLMap,
} from 'yaml';
import { TypeKind } from '../config/type';

export function describeTypeKind(kind: TypeKind) {
    switch (kind) {
        case TypeKind.ENUM:
            return 'an enum type';
        case TypeKind.SCALAR:
            // note: it's currently not possible to declare those
            return 'a scalar type';
        case TypeKind.ROOT_ENTITY:
            return 'a root entity type';
        case TypeKind.CHILD_ENTITY:
            return 'a child entity type';
        case TypeKind.ENTITY_EXTENSION:
            return 'an entity extension type';
        case TypeKind.VALUE_OBJECT:
            return 'a value object type';
        default:
            throw new Error(`Unexpected type kind: ${kind as string}`);
    }
}

export function getYamlNodePairAtPath(
    source: string | Document,
    path: unknown[] | ReadonlyArray<unknown>,
): Pair<Scalar<string>> | null {
    const doc = isDocument(source) ? source : parseDocument(source);
    const parentYamlNode = doc.getIn(path.slice(0, -1));
    if (isMap(parentYamlNode)) {
        const result = parentYamlNode.items.find(
            (item) => isScalar(item.key) && item.key.value === path.at(-1),
        );
        if (isPair<Scalar<string>>(result)) {
            return result;
        }
    }
    return null;
}

export function getYamlNodePairAtPathOrThrow(
    source: string | Document,
    path: unknown[] | ReadonlyArray<unknown>,
): Pair<Scalar<string>> {
    const res = getYamlNodePairAtPath(source, path);
    if (!res) {
        throw new Error(
            `Expected pair at path "${path.map(String).join('.')}" for document:\n${source.toString()}`,
        );
    }
    return res;
}

export function getYamlMapAtPath(source: string | Document, path: unknown[]): YAMLMap | undefined {
    const doc = isDocument(source) ? source : parseDocument(source);
    const nodeResult = doc.getIn(path);
    return isMap(nodeResult) ? nodeResult : undefined;
}

export function patchBeforeCommentFromParentMap(
    doc: Document,
    targetNode: Pair<Scalar>,
    path: unknown[] | ReadonlyArray<unknown>,
): void {
    if (!targetNode.key.commentBefore) {
        const parent = getYamlMapAtPath(doc, path.slice(0, -1));
        if (
            parent?.items.findIndex(
                (item) => isPair<Scalar<string>>(item) && item.key.value === targetNode.key.value,
            ) === 0 &&
            parent.commentBefore
        ) {
            targetNode.key.commentBefore = parent.commentBefore;
        }
    }
}

export function safeParseDocument(str: string): Document | null {
    try {
        const doc = parseDocument(str);
        return doc.errors.length ? null : doc;
    } catch (e: unknown) {
        return null;
    }
}
