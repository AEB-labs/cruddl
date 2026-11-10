import { graphql } from 'graphql';
import { gql } from 'graphql-tag';
import { describe, expect, it } from 'vitest';
import { prettyPrint } from '../core/graphql/pretty-print.js';
import { Project } from '../core/project/project.js';
import { ProjectSource } from '../core/project/source.js';
import { createTempDatabase, getTempDatabase } from '../testing/regression-tests/initialization.js';
import { getAQLQueryComment } from './aql-query-comment.js';
import { ArangoDBAdapter } from './arangodb-adapter.js';
import { CancellationManager } from './cancellation-manager.js';
import { ERROR_QUERY_KILLED } from './error-codes.js';
import { isArangoDBDisabled } from './testing/is-arangodb-disabled.js';

describe('getAQLQueryComment', () => {
    it('only includes the transaction id for anonymous operations', () => {
        expect(getAQLQueryComment('abc', undefined)).toBe('/*id:abc*/');
    });

    it('treats an empty operation name as anonymous', () => {
        expect(getAQLQueryComment('abc', '')).toBe('/*id:abc*/');
    });

    it('adds the operation name in a separate comment', () => {
        expect(getAQLQueryComment('abc', 'GetDeliveries_2')).toBe(
            '/*id:abc*/ /*op:GetDeliveries_2*/',
        );
    });

    it('replaces characters that are not valid in GraphQL names', () => {
        expect(getAQLQueryComment('abc', 'evil*/ FOR x IN secrets RETURN x /*')).toBe(
            '/*id:abc*/ /*op:evil___FOR_x_IN_secrets_RETURN_x___*/',
        );
    });

    it('starts with the prefix the cancellation manager looks for', () => {
        expect(getAQLQueryComment('abc', 'Test').startsWith('/*id:abc*/')).toBe(true);
    });
});

describe.skipIf(isArangoDBDisabled())('AQL query comment in ArangoDB', () => {
    it('shows the operation name in the slow query log', async () => {
        const project = new Project({
            sources: [
                new ProjectSource(
                    'source.graphqls',
                    prettyPrint(gql`
                        type Delivery @rootEntity {
                            deliveryNumber: String
                        }
                    `),
                ),
            ],
            getExecutionOptions: () => ({ disableAuthorization: true }),
        });
        const dbConfig = await createTempDatabase();
        const adapter = new ArangoDBAdapter(dbConfig);
        await adapter.updateSchema(project.getModel());
        const schema = project.createSchema(adapter);
        const db = getTempDatabase();

        const previousTracking = await db.queryTracking();
        try {
            // with a threshold of 0, every query is logged as slow query
            await db.queryTracking({
                enabled: true,
                trackSlowQueries: true,
                slowQueryThreshold: 0,
            });
            await db.clearSlowQueries();

            const namedResult = await graphql({
                schema,
                source: 'query GetDeliveries { allDeliveries { deliveryNumber } }',
            });
            expect(namedResult.errors).toBeUndefined();
            const anonymousResult = await graphql({
                schema,
                source: '{ allDeliveries { id } }',
            });
            expect(anonymousResult.errors).toBeUndefined();

            const slowQueries = (await db.listSlowQueries()).map((q) => q.query);
            const namedQueries = slowQueries.filter((q) => q.includes('/*op:GetDeliveries*/'));
            expect(namedQueries).toHaveLength(1);
            expect(namedQueries[0]).toMatch(/^\/\*id:[0-9a-f-]+\*\/ \/\*op:GetDeliveries\*\/\n/);

            // the anonymous query only has the id comment
            const otherQueries = slowQueries.filter(
                (q) => q.startsWith('/*id:') && !q.includes('/*op:'),
            );
            expect(otherQueries).toHaveLength(1);
            expect(otherQueries[0]).toMatch(/^\/\*id:[0-9a-f-]+\*\/\n/);
        } finally {
            await db.queryTracking({
                enabled: previousTracking.enabled,
                trackSlowQueries: previousTracking.trackSlowQueries,
                slowQueryThreshold: previousTracking.slowQueryThreshold,
            });
        }
    });

    it('finds and kills a running query with an operation name', async () => {
        await createTempDatabase();
        const db = getTempDatabase();
        const transactionID = crypto.randomUUID();
        const comment = getAQLQueryComment(transactionID, 'SlowOperation');

        const queryPromise = db.query(`${comment}\nRETURN SLEEP(30)`);
        // prevent an unhandled rejection while we're waiting for the query to show up
        queryPromise.catch(() => {});

        let runningQuery;
        for (let i = 0; i < 100 && !runningQuery; i++) {
            const runningQueries = await db.listRunningQueries();
            runningQuery = runningQueries.find((q) => q.query.startsWith(comment));
            if (!runningQuery) {
                await new Promise((resolve) => setTimeout(resolve, 50));
            }
        }
        expect(runningQuery?.query).toContain('/*op:SlowOperation*/');

        await new CancellationManager({ database: db }).cancelQuery(transactionID);
        await expect(queryPromise).rejects.toMatchObject({ errorNum: ERROR_QUERY_KILLED });
    });
});
