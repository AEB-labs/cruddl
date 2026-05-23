import { gql } from 'graphql-tag';
import { describe, expect, it } from 'vitest';
import { EntitiesQueryNode } from '../core/query-tree/queries.js';
import { createSimpleModel } from '../testing/utils/create-simple-model.js';
import { getAQLQuery } from './aql-generator.js';
import {
    billingCollectionName,
    getCollectionNameForRelation,
    getCollectionNameForRootEntity,
} from './arango-basics.js';
import { ArangoDBAdapter } from './arangodb-adapter.js';
import {
    getFlexSearchViewNameForRootEntity,
    getRequiredViewsFromModel,
} from './schema-migration/arango-search-helpers.js';
import { getRequiredIndicesFromModel } from './schema-migration/index-helpers.js';

describe('collectionNamePrefix', () => {
    const model = createSimpleModel(gql`
        type Order @rootEntity(flexSearch: true) {
            orderNumber: String @key @flexSearch @index
            deliveries: [Delivery] @relation
        }

        type Delivery @rootEntity {
            trackingNumber: String @index
        }
    `);
    const orderType = model.getRootEntityTypeOrThrow('Order');
    const deliveryType = model.getRootEntityTypeOrThrow('Delivery');
    const orderToDeliveryRelation = orderType.relations[0];

    describe('getCollectionNameForRootEntity', () => {
        it('returns unprefixed name when prefix is undefined', () => {
            expect(getCollectionNameForRootEntity(orderType, { prefix: undefined })).toBe('orders');
        });

        it('prepends the prefix to the collection name', () => {
            expect(getCollectionNameForRootEntity(orderType, { prefix: 'myapp_' })).toBe(
                'myapp_orders',
            );
        });

        it('works with an empty string prefix', () => {
            expect(getCollectionNameForRootEntity(orderType, { prefix: '' })).toBe('orders');
        });
    });

    describe('getCollectionNameForRelation', () => {
        it('returns unprefixed name when prefix is undefined', () => {
            expect(
                getCollectionNameForRelation(orderToDeliveryRelation, { prefix: undefined }),
            ).toBe('orders_deliveries');
        });

        it('prepends the prefix to the edge collection name', () => {
            expect(
                getCollectionNameForRelation(orderToDeliveryRelation, { prefix: 'myapp_' }),
            ).toBe('myapp_orders_deliveries');
        });
    });

    describe('getFlexSearchViewNameForRootEntity', () => {
        it('returns unprefixed view name when prefix is undefined', () => {
            expect(getFlexSearchViewNameForRootEntity(orderType, { prefix: undefined })).toBe(
                'flex_view_orders',
            );
        });

        it('prepends the prefix before flex_view_ in the view name', () => {
            expect(getFlexSearchViewNameForRootEntity(orderType, { prefix: 'myapp_' })).toBe(
                'myapp_flex_view_orders',
            );
        });
    });

    describe('getRequiredViewsFromModel', () => {
        it('returns unprefixed names when prefix is undefined', () => {
            const views = getRequiredViewsFromModel(model, { prefix: undefined });
            expect(views).toHaveLength(1);
            expect(views[0].viewName).toBe('flex_view_orders');
            expect(views[0].collectionName).toBe('orders');
        });

        it('uses the prefix for both view name and collection name', () => {
            const views = getRequiredViewsFromModel(model, { prefix: 'myapp_' });
            expect(views).toHaveLength(1);
            expect(views[0].viewName).toBe('myapp_flex_view_orders');
            expect(views[0].collectionName).toBe('myapp_orders');
        });
    });

    describe('getRequiredIndicesFromModel', () => {
        it('returns unprefixed collection names when prefix is undefined', () => {
            const indices = getRequiredIndicesFromModel(model, { prefix: undefined });
            const orderIndices = indices.filter((i) => i.rootEntity === orderType);
            expect(orderIndices.every((i) => i.collectionName === 'orders')).toBe(true);
        });

        it('prepends the prefix to collection names in index definitions', () => {
            const indices = getRequiredIndicesFromModel(model, { prefix: 'myapp_' });
            const orderIndices = indices.filter((i) => i.rootEntity === orderType);
            const deliveryIndices = indices.filter((i) => i.rootEntity === deliveryType);
            expect(orderIndices.every((i) => i.collectionName === 'myapp_orders')).toBe(true);
            expect(deliveryIndices.every((i) => i.collectionName === 'myapp_deliveries')).toBe(
                true,
            );
        });
    });

    describe('AQL generation', () => {
        it('generates unprefixed collection names when no prefix is set', () => {
            const aqlCompound = getAQLQuery(new EntitiesQueryNode(orderType));
            expect(aqlCompound.readAccessedCollections).toContain('orders');
        });

        it('generates prefixed collection names in AQL when collectionNamePrefix is set', () => {
            const aqlCompound = getAQLQuery(new EntitiesQueryNode(orderType), {
                collectionNamePrefix: 'myapp_',
            });
            expect(aqlCompound.readAccessedCollections).toContain('myapp_orders');
            expect(aqlCompound.readAccessedCollections).not.toContain('orders');
        });

        it('includes prefix in AQL bind parameters', () => {
            const aqlCompound = getAQLQuery(new EntitiesQueryNode(orderType), {
                collectionNamePrefix: 'myapp_',
            });
            const query = aqlCompound.getExecutableQueries()[0];
            expect(query.boundValues).toHaveProperty('@myapp_orders', 'myapp_orders');
        });
    });

    describe('billing collection', () => {
        it('billingCollectionName is a plain string constant', () => {
            expect(billingCollectionName).toBe('billingEntities');
        });
    });

    describe('ArangoDBAdapter constructor validation', () => {
        const validConfig = {
            url: 'http://localhost:8529',
            databaseName: 'test',
        };

        it('accepts a valid prefix', () => {
            expect(
                () =>
                    new ArangoDBAdapter({
                        ...validConfig,
                        collectionNamePrefix: 'myapp_',
                    }),
            ).not.toThrow();
        });

        it('accepts undefined prefix', () => {
            expect(() => new ArangoDBAdapter({ ...validConfig })).not.toThrow();
        });

        it('throws on a prefix with invalid characters (hyphen)', () => {
            expect(
                () =>
                    new ArangoDBAdapter({
                        ...validConfig,
                        collectionNamePrefix: 'my-app_',
                    }),
            ).toThrow(/collectionNamePrefix/);
        });

        it('throws on a prefix with a space', () => {
            expect(
                () =>
                    new ArangoDBAdapter({
                        ...validConfig,
                        collectionNamePrefix: 'my app_',
                    }),
            ).toThrow(/collectionNamePrefix/);
        });

        it('throws on a prefix with a dot', () => {
            expect(
                () =>
                    new ArangoDBAdapter({
                        ...validConfig,
                        collectionNamePrefix: 'my.app_',
                    }),
            ).toThrow(/collectionNamePrefix/);
        });

        it('throws on an empty string prefix', () => {
            expect(
                () =>
                    new ArangoDBAdapter({
                        ...validConfig,
                        collectionNamePrefix: '',
                    }),
            ).toThrow(/collectionNamePrefix/);
        });
    });
});
