import type { Database } from 'arangojs';
import { aql } from 'arangojs/aql';
import type { VectorIndexDescription } from 'arangojs/indexes';
import type { Field } from '../../../core/model/implementation/field.js';
import type { RootEntityType } from '../../../core/model/implementation/root-entity-type.js';
import { getCollectionNameForRootEntity } from '../../arango-basics.js';
import type { ArangoDBConfig } from '../../config.js';
import { computeVectorIndexStatus } from './compute-vector-index-status.js';
import type { VectorIndexDefinition } from './vector-index-definition.js';
import {
    computeAutoNLists,
    mapMetricForArango,
    vectorIndexSlotName,
} from './vector-index-helpers.js';
import type { VectorIndexStatus } from './vector-index-status.js';

/**
 * Gathers data from ArangoDB and delegates all decisions to the pure
 * computeVectorIndexStatus function.
 */
export class VectorIndexAnalyzer {
    constructor(
        private readonly db: Database,
        private readonly config: ArangoDBConfig,
    ) {}

    async analyzeField(field: Field, forceRecreate: boolean): Promise<VectorIndexStatus> {
        const rootEntityType = field.declaringType as RootEntityType;
        const collectionName = getCollectionNameForRootEntity(rootEntityType);
        const fieldName = field.name;
        const vectorIndex = field.vectorIndex!;

        // Fetch existing vector indexes for this field's collection.
        // If the collection doesn't exist yet, treat as empty.
        let existingForField: VectorIndexDescription[] = [];
        let vectorDocumentCount = 0;

        const coll = this.db.collection(collectionName);
        const collectionExists = await coll.exists();

        if (collectionExists) {
            // Fetch all indexes and filter to vector indexes matching this field's slot names
            const allIndexes = await coll.indexes();
            const slotAName = vectorIndexSlotName(fieldName, 'a');
            const slotBName = vectorIndexSlotName(fieldName, 'b');

            existingForField = allIndexes.filter(
                (idx): idx is VectorIndexDescription =>
                    idx.type === 'vector' && (idx.name === slotAName || idx.name === slotBName),
            );

            // Compute vectorDocumentCount (sparse-aware)
            if (vectorIndex.sparse) {
                const cursor = await this.db.query(aql`
                    FOR d IN ${coll}
                        FILTER d.${fieldName} != null
                        COLLECT WITH COUNT INTO n
                        RETURN n
                `);
                const result = await cursor.next();
                vectorDocumentCount = result ?? 0;
            } else {
                const countResult = await coll.count();
                vectorDocumentCount = countResult.count;
            }
        }

        // Build requiredIndex from the field's VectorIndex model definition
        const nListsPinned = vectorIndex.nLists != null;
        const computedNLists = nListsPinned
            ? vectorIndex.nLists!
            : computeAutoNLists(vectorDocumentCount);

        const requiredIndex: VectorIndexDefinition = {
            fields: [fieldName] as [string],
            collectionName,
            sparse: vectorIndex.sparse,
            params: {
                metric: mapMetricForArango(vectorIndex.metric),
                dimension: vectorIndex.dimension || 1,
                nLists: computedNLists,
                trainingIterations: vectorIndex.trainingIterations,
                factory: vectorIndex.factory,
            },
            storedValues:
                vectorIndex.storedValues.length > 0 ? vectorIndex.storedValues : undefined,
        };

        return computeVectorIndexStatus({
            field,
            existingForField,
            requiredIndex,
            vectorDocumentCount,
            computedNLists,
            nListsPinned,
            nListsRebuildThreshold: this.config.vectorIndexNListsRebuildThreshold,
            forceRecreate,
        });
    }
}
