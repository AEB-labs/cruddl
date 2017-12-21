import { DatabaseAdapter } from '../database-adapter';
import { QueryNode } from '../../query/definition';
import { getAQLForQuery } from './aql-generator';
import { Database } from 'arangojs';
import { GraphQLObjectType, GraphQLSchema } from 'graphql';
import {compact, flatMap, objectValues} from '../../utils/utils';
import {getNodeByName, isRelationField, isRootEntityType} from '../../schema/schema-utils';
import { getEdgeType } from '../../schema/edges';
import { getCollectionNameForEdge, getCollectionNameForRootEntity } from './arango-basics';
import { globalContext, Logger, SchemaContext } from '../../config/global';
import {INDICES_DIRECTIVE} from "../../schema/schema-defaults";
import {calculateRequiredIndexOperations, getRequiredIndicesFromSchema, IndexDefinition} from "../index-definition";
import {aql} from "./aql";
import collection = aql.collection;

const DEFAULT_INDEX_TYPE = 'skiplist';

export interface ArangoDBConfig {
    readonly url: string;
    readonly user?: string;
    readonly password?: string;
    readonly databaseName: string;
}

export class ArangoDBAdapter implements DatabaseAdapter {
    private db: Database;
    private logger: Logger;

    constructor(config: ArangoDBConfig, private schemaContext?: SchemaContext) {
        globalContext.registerContext(schemaContext);
        try {
            this.logger = globalContext.loggerProvider.getLogger("ArangoDBAdapter");
        } finally {
            globalContext.unregisterContext();
        }
        this.db = new Database({
            url: config.url,
            databaseName: config.databaseName
        });
        if(config.user) {
            // Unfortunately the typings of arangojs do not include the method "useBasicAuth" although it is present in the implementation of arangojs.
            // Therefore we cast to any
            (this.db as any).useBasicAuth(config.user, config.password);
        }
    }

    async execute(queryTree: QueryNode) {
        globalContext.registerContext(this.schemaContext);
        let cursor;
        try {
            const aql = getAQLForQuery(queryTree);
            this.logger.debug(aql.toColoredString());
            const {code, boundValues} = aql.getCode();
            cursor = await this.db.query(code, boundValues);
        } finally {
            globalContext.unregisterContext();
        }
        return await cursor.next();
    }

    async updateSchema(schema: GraphQLSchema): Promise<void> {
        const rootEntities = objectValues(schema.getTypeMap()).filter(type => isRootEntityType(type)) as GraphQLObjectType[];
        const edgeTypes = flatMap(rootEntities, entity =>
            objectValues(entity.getFields())
                .filter(field => isRelationField(field))
                .map(field => getEdgeType(entity, field)));

        // Get existing collections in ArangoDB
        const collections = await this.db.collections();

        // Creating missing document collections in ArangoDB
        const requiredCollections = rootEntities.map(entity => getCollectionNameForRootEntity(entity));
        const existingCollections = collections.map(coll => (<any>coll).name); // typing for name missing
        const collectionsToCreate = requiredCollections.filter(c => existingCollections.indexOf(c) < 0);
        this.logger.info(`Creating collections ${collectionsToCreate.join(', ')}...`);
        const createTasks = collectionsToCreate.map(col => this.db.collection(col.toString()).create({waitForSync: false}));
        await Promise.all(createTasks);
        this.logger.info(`Done`);

        // update indices
        const requiredIndices = getRequiredIndicesFromSchema(schema);
        const existingIndicesPromises = rootEntities.map(entity => this.getCollectionIndices(entity));
        let existingIndices: IndexDefinition[] = [];
        await Promise.all(existingIndicesPromises).then(promiseResults => promiseResults.forEach(indices => indices.forEach(index => existingIndices.push(index))));
        const { indicesToDelete, indicesToCreate } = calculateRequiredIndexOperations(existingIndices, requiredIndices);
        const deleteIndicesPromises = indicesToDelete.map(indexToDelete => {
            const collection = getCollectionNameForRootEntity(indexToDelete.rootEntity);
            if (indexToDelete.id.endsWith('/0')) {
                // Don't delete primary indices
                return;
            }
            this.logger.info(`Dropping index ${indexToDelete.id} with fields ${indexToDelete.fields.join(',')}`);
            return this.db.collection(collection).dropIndex(indexToDelete.id);
        });
        await Promise.all(deleteIndicesPromises);
        const createIndicesPromises = indicesToCreate.map(indexToCreate => {
            const collection = getCollectionNameForRootEntity(indexToCreate.rootEntity);
            this.logger.info(`Creating ${ indexToCreate.unique ? 'unique' : ''} index on collection ${collection} on field(s) ${indexToCreate.fields.join(',')}`);
            return this.db.collection(collection).createIndex({fields: indexToCreate.fields, unique: indexToCreate.unique, type: DEFAULT_INDEX_TYPE})
        });
        await Promise.all(createIndicesPromises);

        // Creating missing edge collections in ArangoDB
        const requiredEdgeCollections = Array.from(new Set(edgeTypes.map(edge => getCollectionNameForEdge(edge))));
        const existingEdgeCollections = collections.map(coll => (<any>coll).name); // typing for name missing
        const edgeCollectionsToCreate = requiredEdgeCollections.filter(c => existingEdgeCollections.indexOf(c) < 0);
        this.logger.info(`Creating edge collections ${edgeCollectionsToCreate.join(', ')}...`);
        const createEdgeTasks = edgeCollectionsToCreate.map(col => this.db.edgeCollection(col.toString()).create({waitForSync: false}));
        await Promise.all(createEdgeTasks);
        this.logger.info(`Done`);
    }

    async getCollectionIndices(rootEntity: GraphQLObjectType): Promise<IndexDefinition[]> {
        const collectionName = getCollectionNameForRootEntity(rootEntity);
        return this.db.collection(collectionName).indexes().then(result => result.map(index => {
            return {...index, rootEntity }
        }));
    }
}

