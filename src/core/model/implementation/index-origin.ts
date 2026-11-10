import { Kind } from 'graphql';
import { KEY_FIELD_DIRECTIVE } from '../../schema/constants.js';
import { findDirectiveWithName } from '../../schema/schema-utils.js';
import type { IndexDefinitionConfig } from '../config/indices.js';
import { MessageLocation } from '../validation/location.js';
import type { Field } from './field.js';
import { Index } from './indices.js';
import type { RootEntityType } from './root-entity-type.js';
import type { TimeToLiveType } from './time-to-live.js';
import type { VectorIndex } from './vector-index.js';

/**
 * Describes which part of the model requires an index
 */
export type IndexOrigin =
    | KeyIndexOrigin
    | FieldDirectiveIndexOrigin
    | RootEntityIndicesIndexOrigin
    | TimeToLiveIndexOrigin
    | DiscriminatorIndexOrigin
    | VectorIndexOrigin;

interface IndexOriginBase {
    readonly rootEntityType: RootEntityType;

    /**
     * The location in the sources of the construct that requires the index, if available
     */
    readonly location: MessageLocation | undefined;
}

interface PersistentIndexOriginBase extends IndexOriginBase {
    readonly index: Index;
}

/**
 * The unique index that is created for the field marked with @key
 *
 * This index is sparse (like all unique indices without an explicit sparse: false), so it can't be
 * used for sorting.
 */
export interface KeyIndexOrigin extends PersistentIndexOriginBase {
    readonly kind: 'key';
    readonly field: Field;
}

/**
 * An index declared with @index or @unique on a field of a root entity type
 */
export interface FieldDirectiveIndexOrigin extends PersistentIndexOriginBase {
    readonly kind: 'fieldDirective';
    readonly field: Field;
}

/**
 * An index declared in the "indices" argument of @rootEntity
 */
export interface RootEntityIndicesIndexOrigin extends PersistentIndexOriginBase {
    readonly kind: 'rootEntityIndices';
}

/**
 * The index on the date field of a time-to-live configuration
 */
export interface TimeToLiveIndexOrigin extends PersistentIndexOriginBase {
    readonly kind: 'timeToLive';
    readonly timeToLiveType: TimeToLiveType;
}

/**
 * The index on the discriminator field (id) that cruddl adds so it can sort by it
 */
export interface DiscriminatorIndexOrigin extends PersistentIndexOriginBase {
    readonly kind: 'discriminator';
    readonly field: Field;
}

/**
 * A vector index declared with @vectorIndex on a field
 */
export interface VectorIndexOrigin extends IndexOriginBase {
    readonly kind: 'vectorIndex';
    readonly field: Field;
    readonly vectorIndex: VectorIndex;
}

export type PersistentIndexOrigin = Exclude<IndexOrigin, VectorIndexOrigin>;

export interface IndexWithOrigin {
    readonly index: Index;
    readonly origin: PersistentIndexOrigin;
}

/**
 * Gets the indices of a root entity type (including those cruddl adds implicitly), together with
 * the part of the model they come from
 *
 * If multiple parts of the model require the same index, the index is only included once, with the
 * origin that comes first in this order: explicitly declared indices, @key, time-to-live,
 * discriminator.
 */
export function getIndicesWithOrigins(
    rootEntityType: RootEntityType,
): ReadonlyArray<IndexWithOrigin> {
    type Origin = (index: Index) => PersistentIndexOrigin;
    const entries: { config: IndexDefinitionConfig; getOrigin: Origin }[] = [];

    for (const config of rootEntityType.indexConfigs) {
        entries.push({
            config,
            getOrigin: (index) => getExplicitIndexOrigin(index, rootEntityType),
        });
    }

    // @key implies a unique index
    const keyField = rootEntityType.keyField;
    if (keyField) {
        if (
            !rootEntityType.indexConfigs.some(
                (f) => f.unique === true && f.fields.length == 1 && f.fields[0] === keyField.name,
            )
        ) {
            entries.push({
                config: { unique: true, fields: [keyField.name] },
                getOrigin: (index) => ({
                    kind: 'key',
                    rootEntityType,
                    index,
                    field: keyField,
                    location: getKeyLocation(rootEntityType),
                }),
            });
        }
    }

    for (const timeToLiveType of rootEntityType.timeToLiveTypes) {
        entries.push({
            config: { unique: false, fields: [timeToLiveType.input.dateField] },
            getOrigin: (index) => ({
                kind: 'timeToLive',
                rootEntityType,
                index,
                timeToLiveType,
                location: timeToLiveType.input.dateFieldLoc,
            }),
        });
    }

    const indices: IndexWithOrigin[] = entries.map(({ config, getOrigin }) => {
        const index = new Index(config, rootEntityType);
        return { index, origin: getOrigin(index) };
    });

    const discriminatorField = rootEntityType.discriminatorField;
    if (discriminatorField !== keyField) {
        if (
            !indices.some(
                ({ index }) =>
                    index.fields.length === 1 && index.fields[0].field === discriminatorField,
            )
        ) {
            // make sure there is an index on the discriminator field that can be used for sorting
            // arangodb already has an index on 'id', but it's a hash index which is unusable for sorting
            // if the discriminator field is the key field, we already added an index above.
            // don't use unique to avoid running into performance workarounds for unique indices (sparseness)
            const index = new Index({ fields: [discriminatorField.name] }, rootEntityType);
            indices.push({
                index,
                origin: {
                    kind: 'discriminator',
                    rootEntityType,
                    index,
                    field: discriminatorField,
                    location: undefined,
                },
            });
        }
    }

    // deduplicate indices (keep the first one so explicitly declared indices win)
    return indices.filter(
        ({ index }, i1) => !indices.some((other, i2) => i2 < i1 && other.index.equals(index)),
    );
}

function getExplicitIndexOrigin(
    index: Index,
    rootEntityType: RootEntityType,
): PersistentIndexOrigin {
    const location = index.astNode?.loc ? MessageLocation.from(index.astNode) : undefined;
    // @index and @unique on fields produce a directive node, @rootEntity(indices) object values
    if (index.astNode?.kind === Kind.DIRECTIVE && index.fields.length === 1) {
        const field = rootEntityType.getField(index.fields[0].dotSeparatedPath);
        if (field) {
            return { kind: 'fieldDirective', rootEntityType, index, field, location };
        }
    }
    return { kind: 'rootEntityIndices', rootEntityType, index, location };
}

function getKeyLocation(rootEntityType: RootEntityType): MessageLocation | undefined {
    const fieldNode = rootEntityType.keyFieldASTNode;
    const node =
        fieldNode?.kind === Kind.FIELD_DEFINITION
            ? (findDirectiveWithName(fieldNode, KEY_FIELD_DIRECTIVE) ?? fieldNode)
            : fieldNode;
    return node?.loc ? MessageLocation.from(node) : undefined;
}
