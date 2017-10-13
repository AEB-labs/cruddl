import { DatabaseAdapter } from '../database-adapter';
import { QueryNode } from '../../query/definition';
import { getAQLForQuery } from './aql-generator';
import { Database } from 'arangojs';
import { GraphQLObjectType, GraphQLSchema } from 'graphql';
import { flatMap, objectValues } from '../../utils/utils';
import { isRelationField, isRootEntityType } from '../../schema/schema-utils';
import { getEdgeType } from '../../schema/edges';
import { getCollectionNameForEdge, getCollectionNameForRootEntity } from './arango-basics';

export interface ArangoDBConfig {
    readonly url: string;
    readonly user?: string;
    readonly password?: string;
    readonly databaseName: string;
}

export class ArangoDBAdapter implements DatabaseAdapter {
    private db: Database;

    constructor(config: ArangoDBConfig) {
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
        const aql = getAQLForQuery(queryTree);
        console.log(aql.toPrettyString());
        const cursor = await this.db.query(aql.code, aql.bindValues);
        return await cursor.next();
    }

    async updateSchema(schema: GraphQLSchema): Promise<void> {
        const rootEntities = objectValues(schema.getTypeMap()).filter(type => isRootEntityType(type)) as GraphQLObjectType[];
        const edgeTypes = flatMap(rootEntities, entity =>
            objectValues(entity.getFields())
                .filter(field => isRelationField(field))
                .map(field => getEdgeType(entity, field)));

        // Get existing collections in ArangoDB
        const colls = await this.db.collections();

        // Creating missing document collections in ArangoDB
        const requiredCollections = rootEntities.map(entity => getCollectionNameForRootEntity(entity));
        const existingCollections = colls.map(coll => (<any>coll).name); // typing for name missing
        const collectionsToCreate = requiredCollections.filter(c => existingCollections.indexOf(c) < 0);
        console.log(`Creating collections ${collectionsToCreate.join(', ')}...`);
        const createTasks = collectionsToCreate.map(col => this.db.collection(col.toString()).create({waitForSync: false}));
        await Promise.all(createTasks);
        console.log(`Done`);

        // TODO create indices

        // Creating missing edge collections in ArangoDB
        const requiredEdgeCollections = Array.from(new Set(edgeTypes.map(edge => getCollectionNameForEdge(edge))));
        const existingEdgeCollections = colls.map(coll => (<any>coll).name); // typing for name missing
        const edgeCollectionsToCreate = requiredEdgeCollections.filter(c => existingEdgeCollections.indexOf(c) < 0);
        console.log(`Creating edge collections ${edgeCollectionsToCreate.join(', ')}...`);
        const createEdgeTasks = edgeCollectionsToCreate.map(col => this.db.edgeCollection(col.toString()).create({waitForSync: false}));
        await Promise.all(createEdgeTasks);
        console.log(`Done`);
    }
}
