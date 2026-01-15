import { expect } from 'chai';
import deepEqual from 'deep-equal';
import gql from 'graphql-tag';
import { ArangoDBAdapter, ArangoDBConfig } from '../../../../src/database/arangodb';
import { prettyPrint } from '../../../../src/graphql/pretty-print';
import { Project } from '../../../../src/project/project';
import { ProjectSource } from '../../../../src/project/source';
import { createTempDatabase, getTempDatabase } from '../../../regression/initialization';
import { isArangoDBDisabled } from '../arangodb-test-utils';
import { ArangoSearchViewProperties, TierConsolidationPolicy } from 'arangojs/view';
import { Model } from '../../../../src/model';

type GqlDocument = ReturnType<typeof gql>;

interface IndexExpectation {
    readonly fields: ReadonlyArray<string>;
    readonly type?: string;
    readonly unique?: boolean;
    readonly sparse?: boolean;
}

describe('ArangoDB schema migrations (integration)', function () {
    if (isArangoDBDisabled()) {
        (this as any).skip();
        return;
    }

    this.timeout(20000);

    it('creates required resources and remains stable across runs', async function () {
        const project = buildProject(gql`
            enum DeliveryStatus {
                CREATED
                SHIPPED
            }

            type Customer @rootEntity {
                code: String @key
                deliveries: [Delivery] @relation
            }

            type Delivery
                @rootEntity(
                    flexSearch: true
                    flexSearchPerformanceParams: { commitIntervalMsec: 2000 }
                ) {
                deliveryNumber: String @key @flexSearch
                status: DeliveryStatus @index @flexSearch
                customer: Customer @relation(inverseOf: "deliveries")
            }
        `);
        const model = project.getModel();
        const adapter = await createDbAndAdapter();

        await runMigrationsAndCheckStable(adapter, model);

        const db = getTempDatabase();
        expect(await db.collection('deliveries').exists()).to.equal(true);
        expect(await db.collection('customers').exists()).to.equal(true);
        expect(await db.collection('customers_deliveries').exists()).to.equal(true);

        const deliveryIndexes = await db.collection('deliveries').indexes();
        expect(
            hasIndex(deliveryIndexes, { fields: ['status'], type: 'persistent', unique: false }),
        ).to.equal(true);
        expect(
            hasIndex(deliveryIndexes, {
                fields: ['deliveryNumber'],
                type: 'persistent',
                unique: true,
                sparse: true, // unique indices are sparse by default
            }),
        ).to.equal(true);

        const viewNames = (await db.listViews()).map((view) => view.name);
        expect(viewNames).to.include('flex_view_deliveries');

        const deliveryView = db.view('flex_view_deliveries');
        const viewProperties = (await deliveryView.properties()) as ArangoSearchViewProperties;
        expect(viewProperties.commitIntervalMsec).to.equal(2000);
    });

    it('drops obsolete indices and views when the schema changes', async function () {
        const initialProject = buildProject(gql`
            type Warehouse @rootEntity(flexSearch: true) {
                code: String @key @flexSearch
                obsoleteFlag: Boolean @index
            }
        `);
        const initialModel = initialProject.getModel();
        const adapter = await createDbAndAdapter();
        await runMigrationsAndCheckStable(adapter, initialModel);

        const db = getTempDatabase();
        let warehouseIndexes = await db.collection('warehouses').indexes();
        expect(
            hasIndex(warehouseIndexes, { fields: ['obsoleteFlag'], type: 'persistent' }),
        ).to.equal(true);
        let viewNames = (await db.listViews()).map((view) => view.name);
        expect(viewNames).to.include('flex_view_warehouses');

        const firstOutstanding = await adapter.getOutstandingMigrations(initialModel);
        expect(firstOutstanding).to.be.empty;

        const updatedProject = buildProject(gql`
            type Warehouse @rootEntity {
                code: String @key
                description: String @index
            }
        `);
        const updatedModel = updatedProject.getModel();
        await runMigrationsAndCheckStable(adapter, updatedModel);

        const secondOutstanding = await adapter.getOutstandingMigrations(updatedModel);
        expect(secondOutstanding).to.be.empty;

        viewNames = (await db.listViews()).map((view) => view.name);
        expect(viewNames).to.not.include('flex_view_warehouses');

        warehouseIndexes = await db.collection('warehouses').indexes();
        expect(
            hasIndex(warehouseIndexes, { fields: ['obsoleteFlag'], type: 'persistent' }),
        ).to.equal(false);
        expect(
            hasIndex(warehouseIndexes, { fields: ['description'], type: 'persistent' }),
        ).to.equal(true);
    });

    it('handles setting old consolidation policy properties in 3.12.7', async function () {
        // 3.12.7 soft-removed some properties, so they are ignored when set.
        // This would mean that the adapter constantly generates a migration to update it to the
        // intended value. This test ensures that this does not happen.

        const consolidationPolicy: TierConsolidationPolicy = {
            type: 'tier',
            minScore: 0,
            segmentsMin: 3,
            segmentsMax: 1000,
            segmentsBytesFloor: 262144,
            segmentsBytesMax: 536870912,
        };

        const project = buildProject(gql`
            type Delivery @rootEntity(flexSearch: true) {
                deliveryNumber: String @key @flexSearch
            }
        `);
        const model = project.getModel();
        const adapter = await createDbAndAdapter({
            arangoSearchConfiguration: {
                consolidationPolicy,
            },
        });

        await runMigrationsAndCheckStable(adapter, model);

        const db = getTempDatabase();
        const view = (await db
            .view('flex_view_deliveries')
            .properties()) as ArangoSearchViewProperties;

        // if we're running this test against ArangoDB 3.12.6 or earlier, make sure it's set
        if ('minScore' in view.consolidationPolicy) {
            expect(view.consolidationPolicy).to.deep.equal(consolidationPolicy);
        }
    });
});

async function runMigrationsAndCheckStable(adapter: ArangoDBAdapter, model: Model) {
    const pendingBeforeUpdate = await adapter.getOutstandingMigrations(model);
    expect(pendingBeforeUpdate).not.to.be.empty;

    await adapter.updateSchema(model);

    const pendingAfterUpdate = await adapter.getOutstandingMigrations(model);
    expect(pendingAfterUpdate).not.to.be.empty;

    for (const migration of pendingAfterUpdate) {
        await adapter.performMigration(migration);
    }

    // make sure it's stable and does not re-generate already performed migrations
    const pendingAfterMigrations = await adapter.getOutstandingMigrations(model);
    expect(pendingAfterMigrations).to.deep.equal([]);
}

async function createDbAndAdapter(
    options: Omit<ArangoDBConfig, 'databaseName' | 'url'> = {},
): Promise<ArangoDBAdapter> {
    const dbConfig = await createTempDatabase();
    return new ArangoDBAdapter({
        ...dbConfig,
        createIndicesInBackground: true,
        doNonMandatoryMigrations: false, // make this an explicit step
        ...options,
    });
}

function buildProject(document: GqlDocument): Project {
    return new Project({
        sources: [new ProjectSource('schema.graphql', prettyPrint(document))],
        getExecutionOptions: () => ({ disableAuthorization: true }),
    });
}

function hasIndex(indexes: ReadonlyArray<any>, expectation: IndexExpectation) {
    return indexes.some((index) => matchesIndex(index, expectation));
}

function matchesIndex(actual: any, expectation: IndexExpectation) {
    if (!deepEqual(actual.fields, expectation.fields)) {
        return false;
    }
    if (expectation.type !== undefined && actual.type !== expectation.type) {
        return false;
    }
    if (expectation.unique !== undefined && actual.unique !== expectation.unique) {
        return false;
    }
    if (expectation.sparse !== undefined && actual.sparse !== expectation.sparse) {
        return false;
    }
    return true;
}
