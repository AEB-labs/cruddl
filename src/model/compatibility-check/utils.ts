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
import { LocalizationBaseConfig, LocalizationConfig, TypeLocalizationConfig } from '../config';
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

/**
 * Helper function that transfers the `commentBefore` from the parent map to the target node if existing.
 * This is a workaround for the fact that `yaml` library attaches the `commentBefore` of the first pair
 * in a map to the map itself and not to the pair's key.
 *
 * @returns The original node if nothing needed to be patched, otherwise a clone of the original node with the patched comment.
 */
export function patchBeforeCommentFromParentMap(
    doc: Document,
    targetNode: Pair<Scalar>,
    path: unknown[] | ReadonlyArray<unknown>,
): Pair<Scalar> {
    if (!targetNode.key.commentBefore) {
        const parent = getYamlMapAtPath(doc, path.slice(0, -1));
        if (
            parent?.items.findIndex(
                (item) => isPair<Scalar<string>>(item) && item.key.value === targetNode.key.value,
            ) === 0 &&
            parent.commentBefore
        ) {
            const clonedNode = targetNode.clone();
            clonedNode.key.commentBefore = parent.commentBefore;
            return clonedNode;
        }
    }
    return targetNode;
}

export function safeParseDocument(str: string): Document | null {
    try {
        const doc = parseDocument(str);
        return doc.errors.length ? null : doc;
    } catch (e: unknown) {
        return null;
    }
}

/**
 * Finds the first config (per language) that declares at least one global field localization
 */
export function getFirstMatchingGlobalFieldConfigs(
    configs: ReadonlyArray<LocalizationConfig>,
): Record<string, LocalizationConfig> {
    const result: Record<string, LocalizationConfig> = {};
    for (const config of configs) {
        const hasGlobalFields = config.fields && Object.keys(config.fields).length;
        if (hasGlobalFields && !result[config.language]) {
            result[config.language] = config;
        }
    }
    return result;
}

/**
 * Returns the raw localization configs for the given type, if existing.
 */
export function getTypeLocalizationConfigs(
    configs: ReadonlyArray<LocalizationConfig>,
    typeName: string,
): Record<string, TypeLocalizationConfig> {
    const result: Record<string, TypeLocalizationConfig> = {};
    for (const config of configs) {
        const matchingType = config?.types?.[typeName];
        if (matchingType) {
            result[config.language] = matchingType;
        }
    }
    return result;
}

/**
 * Returns the raw localization configs for the field under the given type, if existing.
 *
 * This function can be used when non-merged (i.e. not containing global localization) localizations are needed.
 */
export function getFieldLocalizationConfigs(
    configs: ReadonlyArray<LocalizationConfig>,
    typeName: string,
    fieldName: string,
): Record<string, LocalizationBaseConfig> {
    const result: Record<string, LocalizationBaseConfig> = {};
    for (const config of configs) {
        const matchingType = config?.types?.[typeName];
        if (matchingType) {
            const matchingField = matchingType.fields?.[fieldName];
            if (matchingField) {
                result[config.language] = matchingField;
            }
        }
    }
    return result;
}

/**
 * Returns the raw global localization configs for a given field name, if existing.
 *
 * This function can be used when non-merged (i.e. not containing type dependent localizations are needed.
 */
export function getGlobalFieldLocalizationConfigs(
    configs: ReadonlyArray<LocalizationConfig>,
    fieldName: string,
): Record<string, LocalizationBaseConfig> {
    const result: Record<string, LocalizationBaseConfig> = {};
    for (const config of configs) {
        const matchingGlobalField = config.fields?.[fieldName];
        if (matchingGlobalField) {
            result[config.language] = matchingGlobalField;
        }
    }
    return result;
}
