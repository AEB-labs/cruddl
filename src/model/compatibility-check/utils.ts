import { TypeKind } from '../config/type';
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

export function getYamlNodePairAtPathOrThrow(
    source: string | Document,
    path: unknown[],
): Pair<Scalar<string>> {
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
    throw new Error(
        `Expected pair at path "${path.map(String).join('.')}" for document:\n${doc.toString()}`,
    );
}

export function getYamlMapAtPath(source: string | Document, path: unknown[]): YAMLMap | undefined {
    const doc = isDocument(source) ? source : parseDocument(source);
    const nodeResult = doc.getIn(path);
    return isMap(nodeResult) ? nodeResult : undefined;
}

export function patchBeforeCommentFromParentMap(
    doc: Document,
    targetNode: Pair<Scalar>,
    path: unknown[],
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
