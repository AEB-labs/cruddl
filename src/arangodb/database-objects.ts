import type { IndexOrigin } from '../core/model/implementation/index-origin.js';
import type { Model } from '../core/model/implementation/model.js';
import type { Relation } from '../core/model/implementation/relation.js';
import type { RootEntityType } from '../core/model/implementation/root-entity-type.js';
import { MessageLocation } from '../core/model/validation/location.js';
import {
    billingCollectionName,
    getCollectionNameForRelation,
    getCollectionNameForRootEntity,
} from './arango-basics.js';
import { getFlexSearchViewNameForRootEntity } from './schema-migration/arango-search-helpers.js';
import {
    type IndexDefinition,
    getRequiredIndicesWithOriginsFromModel,
} from './schema-migration/index-helpers.js';
import { getRequiredVectorIndexDefinition } from './schema-migration/vector-index/vector-index-definition.js';

/**
 * The ArangoDB collections, indexes and views cruddl uses for a model
 */
export interface ModelDatabaseObjects {
    /**
     * The document collections of root entity types, the edge collections of relations, and the
     * collection for billing entities
     */
    readonly collections: ReadonlyArray<ModelDatabaseCollection>;

    /**
     * The indexes cruddl creates for the model
     *
     * Does not include the indexes ArangoDB creates for every collection on its own (the primary
     * index on _key, and the edge index on _from and _to in edge collections).
     */
    readonly indexes: ReadonlyArray<ModelDatabaseIndex>;

    /**
     * The ArangoSearch views of root entity types with flexSearch
     */
    readonly views: ReadonlyArray<ModelDatabaseView>;
}

export interface ModelDatabaseCollection {
    readonly name: string;

    /**
     * The root entity type stored in this collection, if it is a document collection of a root
     * entity type
     */
    readonly rootEntityType?: RootEntityType;

    /**
     * The relation stored in this collection, if it is an edge collection
     */
    readonly relation?: Relation;
}

export interface ModelDatabaseIndex {
    /**
     * The index as cruddl creates it
     *
     * Vector indexes are created under one of two generated names, and their nLists parameter
     * depends on the number of documents unless the model specifies it. Because of that, name and
     * params.nLists can be undefined for vector indexes.
     */
    readonly definition: IndexDefinition;

    /**
     * The part of the model that requires this index
     */
    readonly origin: IndexOrigin;
}

export interface ModelDatabaseView {
    readonly name: string;
    readonly rootEntityType: RootEntityType;
}

export function getModelDatabaseObjects(
    model: Model,
    { prefix }: { prefix: string | undefined },
): ModelDatabaseObjects {
    const collections: ModelDatabaseCollection[] = [
        ...model.rootEntityTypes.map((rootEntityType) => ({
            name: getCollectionNameForRootEntity(rootEntityType, { prefix }),
            rootEntityType,
        })),
        ...model.relations.map((relation) => ({
            name: getCollectionNameForRelation(relation, { prefix }),
            relation,
        })),
        { name: (prefix ?? '') + billingCollectionName },
    ];

    const persistentIndexes: ReadonlyArray<ModelDatabaseIndex> =
        getRequiredIndicesWithOriginsFromModel(model, { prefix });

    const vectorIndexes = model.rootEntityTypes.flatMap((rootEntityType) =>
        rootEntityType.vectorIndices.map((vectorIndex): ModelDatabaseIndex => {
            const { fieldName, ...definition } = getRequiredVectorIndexDefinition(
                vectorIndex.field,
                {
                    collectionName: getCollectionNameForRootEntity(rootEntityType, { prefix }),
                    nLists: undefined,
                },
            );
            return {
                definition: { ...definition, type: 'vector', fields: [fieldName] },
                origin: {
                    kind: 'vectorIndex',
                    rootEntityType,
                    field: vectorIndex.field,
                    vectorIndex,
                    location: vectorIndex.astNode?.loc
                        ? MessageLocation.from(vectorIndex.astNode)
                        : undefined,
                },
            };
        }),
    );

    const views = model.rootEntityTypes
        .filter((rootEntityType) => rootEntityType.isFlexSearchIndexed)
        .map((rootEntityType) => ({
            name: getFlexSearchViewNameForRootEntity(rootEntityType, { prefix }),
            rootEntityType,
        }));

    return { collections, indexes: [...persistentIndexes, ...vectorIndexes], views };
}
