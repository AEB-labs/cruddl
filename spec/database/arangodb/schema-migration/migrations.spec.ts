import { expect } from 'chai';
import deepEqual from 'deep-equal';
import gql from 'graphql-tag';
import { ArangoDBAdapter, ArangoDBConfig } from '../../../../src/database/arangodb';
import { prettyPrint } from '../../../../src/graphql/pretty-print';
import { Project } from '../../../../src/project/project';
import { ProjectSource } from '../../../../src/project/source';
import { createTempDatabase, getTempDatabase } from '../../../regression/initialization';
import { isArangoDBDisabled } from '../arangodb-test-utils';
import { ArangoSearchViewProperties } from 'arangojs/view';
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
