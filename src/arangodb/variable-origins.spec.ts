import { parse } from 'graphql';
import { gql } from 'graphql-tag';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ExecutionPlan } from '../core/database/database-adapter.js';
import type { SchemaExecutor } from '../core/execution/schema-executor.js';
import { prettyPrint } from '../core/graphql/pretty-print.js';
import { Project } from '../core/project/project.js';
import { ProjectSource } from '../core/project/source.js';
import { createTempDatabase } from '../testing/regression-tests/initialization.js';
import { getAQLQuery } from './aql-generator.js';
import { aqlConfig } from './aql.js';
import { ArangoDBAdapter } from './arangodb-adapter.js';
import { isArangoDBDisabled } from './testing/is-arangodb-disabled.js';

describe.skipIf(isArangoDBDisabled())('variableOrigins in the execution plan', () => {
    let executor: SchemaExecutor;

    beforeAll(async () => {
        const project = new Project({
            sources: [
                new ProjectSource(
                    'schema.graphqls',
                    prettyPrint(gql`
                        type Consignment @rootEntity(flexSearch: true) {
                            consignmentNumber: String @key @flexSearch
                            deliveries: [Delivery] @relation
                            handlingUnits: [HandlingUnit] @collect(path: "deliveries.handlingUnits")
                            items: [Item]
                        }

                        type Delivery @rootEntity {
                            deliveryNumber: String @key
                            consignment: Consignment @relation(inverseOf: "deliveries")
                            handlingUnits: [HandlingUnit] @relation
                        }

                        type HandlingUnit @rootEntity {
                            huNumber: String @key
                            delivery: Delivery @relation(inverseOf: "handlingUnits")
                        }

                        type Item @childEntity {
                            itemNumber: String
                        }
                    `),
                ),
                new ProjectSource(
                    'permission-profiles.json',
                    JSON.stringify({
                        permissionProfiles: {
                            default: { permissions: [{ roles: ['user'], access: 'readWrite' }] },
                        },
                    }),
                ),
            ],
        });
        const adapter = new ArangoDBAdapter(await createTempDatabase());
        await adapter.updateSchema(project.getModel());
        executor = project.createSchemaExecutor(adapter);

        await execute(`
            mutation {
                createConsignment(input: {
                    consignmentNumber: "C1"
                    items: [{ itemNumber: "I1" }]
                    createDeliveries: [{
                        deliveryNumber: "D1"
                        createHandlingUnits: [{ huNumber: "H1" }]
                    }]
                }) {
                    consignmentNumber
                }
            }
        `);
    });

    async function execute(
        source: string,
        { explainOnly = false }: { readonly explainOnly?: boolean } = {},
    ): Promise<ExecutionPlan> {
        const result = await executor.tryExecute({
            document: parse(source),
            options: { authContext: { authRoles: ['user'] }, recordPlan: true, explainOnly },
        });
        if (!result) {
            throw new Error(`Operation can not be executed`);
        }
        if (result.error) {
            throw result.error;
        }
        const plan = result.profile?.plan;
        if (!plan) {
            throw new Error(`Missing plan`);
        }
        return plan;
    }

    /**
     * Executes the operation and returns for each transaction step a map of AQL variable names
     * to the dot-separated path of the field they originate from
     */
    async function getOriginPaths(
        source: string,
    ): Promise<ReadonlyArray<{ readonly [aqlVariableName: string]: string }>> {
        const plan = await execute(source);
        return plan.transactionSteps.map((step) => {
            expect(step.variableOrigins).not.toBeUndefined();
            return Object.fromEntries(
                Object.entries(step.variableOrigins ?? {}).map(([name, origin]) => [
                    name,
                    origin.path.join('.'),
                ]),
            );
        });
    }

    it('includes the full origin of a root list field', async () => {
        const plan = await execute(`
            query {
                allConsignments {
                    consignmentNumber
                }
            }
        `);
        expect(plan.transactionSteps).toHaveLength(1);
        expect(plan.transactionSteps[0].variableOrigins).toEqual({
            v_consignment1: {
                path: ['allConsignments'],
                parentTypeName: 'Query',
                fieldName: 'allConsignments',
                loc: { line: 3, column: 17 },
            },
        });
    });

    it('includes the origins with explainOnly', async () => {
        const plan = await execute(
            `
                query {
                    allConsignments {
                        deliveries { deliveryNumber }
                    }
                }
            `,
            { explainOnly: true },
        );
        expect(plan.transactionSteps).toHaveLength(1);
        const step = plan.transactionSteps[0];
        expect(step.stats).toBeUndefined();
        expect(
            Object.fromEntries(
                Object.entries(step.variableOrigins ?? {}).map(([name, origin]) => [
                    name,
                    origin.path.join('.'),
                ]),
            ),
        ).toEqual({
            v_consignment1: 'allConsignments',
            v_delivery1: 'allConsignments.deliveries',
        });
    });

    it('attributes the variables of a single root entity and its child entities', async () => {
        expect(
            await getOriginPaths(`
                query {
                    Consignment(consignmentNumber: "C1") {
                        consignmentNumber
                        items { itemNumber }
                    }
                }
            `),
        ).toEqual([
            {
                v_consignment1: 'Consignment',
                v_consignment2: 'Consignment',
            },
        ]);
    });

    it('attributes relation traversals to the relation fields', async () => {
        expect(
            await getOriginPaths(`
                query {
                    allConsignments {
                        deliveries {
                            deliveryNumber
                            consignment { consignmentNumber }
                        }
                    }
                }
            `),
        ).toEqual([
            {
                v_consignment1: 'allConsignments',
                v_delivery1: 'allConsignments.deliveries',
                v_consignment2: 'allConsignments.deliveries.consignment',
                v_node1: 'allConsignments.deliveries.consignment',
            },
        ]);
    });

    it('attributes all variables of a @collect traversal to the collect field', async () => {
        expect(
            await getOriginPaths(`
                query {
                    allConsignments {
                        handlingUnits {
                            huNumber
                            delivery { deliveryNumber }
                        }
                    }
                }
            `),
        ).toEqual([
            {
                v_consignment1: 'allConsignments',
                v_node1: 'allConsignments.handlingUnits',
                v_edge1: 'allConsignments.handlingUnits',
                v_path1: 'allConsignments.handlingUnits',
                v_node2: 'allConsignments.handlingUnits',
                v_edge2: 'allConsignments.handlingUnits',
                v_path2: 'allConsignments.handlingUnits',
                v_delivery1: 'allConsignments.handlingUnits.delivery',
                v_node3: 'allConsignments.handlingUnits.delivery',
            },
        ]);
    });

    it('attributes child entity lists that use variables', async () => {
        // (simple filters on child entity lists are generated as inline expressions without variables)
        expect(
            await getOriginPaths(`
                query {
                    allConsignments {
                        items(orderBy: itemNumber_ASC) { itemNumber }
                    }
                }
            `),
        ).toEqual([
            {
                v_consignment1: 'allConsignments',
                v_item1: 'allConsignments.items',
            },
        ]);
    });

    it('uses aliases in the path', async () => {
        const plan = await execute(`
            query {
                c: allConsignments {
                    d: deliveries { deliveryNumber }
                }
            }
        `);
        expect(plan.transactionSteps[0].variableOrigins).toEqual({
            v_consignment1: {
                path: ['c'],
                parentTypeName: 'Query',
                fieldName: 'allConsignments',
                loc: { line: 3, column: 17 },
            },
            v_delivery1: {
                path: ['c', 'd'],
                parentTypeName: 'Consignment',
                fieldName: 'deliveries',
                loc: { line: 4, column: 21 },
            },
        });
    });

    it('distinguishes a field that is selected twice with different aliases', async () => {
        expect(
            await getOriginPaths(`
                query {
                    a: allDeliveries(filter: { deliveryNumber: "D1" }) { deliveryNumber }
                    b: allDeliveries(filter: { deliveryNumber: "D2" }) { deliveryNumber }
                    allConsignments {
                        a: deliveries(filter: { deliveryNumber: "D1" }) { deliveryNumber }
                        b: deliveries { consignment { consignmentNumber } }
                    }
                }
            `),
        ).toEqual([
            {
                v_delivery1: 'a',
                v_delivery2: 'b',
                v_consignment1: 'allConsignments',
                v_delivery3: 'allConsignments.a',
                v_delivery4: 'allConsignments.b',
                v_consignment2: 'allConsignments.b.consignment',
                v_node1: 'allConsignments.b.consignment',
            },
        ]);
    });

    it('uses the location within the fragment for fields in fragments', async () => {
        const plan = await execute(`
            query {
                allConsignments { ...F }
            }

            fragment F on Consignment {
                deliveries { deliveryNumber }
            }
        `);
        expect(plan.transactionSteps[0].variableOrigins?.v_delivery1).toEqual({
            path: ['allConsignments', 'deliveries'],
            parentTypeName: 'Consignment',
            fieldName: 'deliveries',
            loc: { line: 7, column: 17 },
        });
    });

    it('attributes flexSearch queries', async () => {
        expect(
            await getOriginPaths(`
                query {
                    flexSearchConsignments(flexSearchFilter: { consignmentNumber: "C1" }) {
                        consignmentNumber
                        deliveries { deliveryNumber }
                    }
                }
            `),
        ).toEqual([
            {
                v_consignment1: 'flexSearchConsignments',
                v_consignment2: 'flexSearchConsignments',
                v_delivery1: 'flexSearchConsignments.deliveries',
            },
        ]);
    });

    it('provides a separate map per transaction step of a mutation', async () => {
        const steps = await getOriginPaths(`
            mutation {
                createDelivery(input: {
                    deliveryNumber: "D2"
                    createHandlingUnits: [{ huNumber: "H2" }]
                }) {
                    deliveryNumber
                    handlingUnits { huNumber }
                }
                deleteConsignment(consignmentNumber: "C9") {
                    consignmentNumber
                }
            }
        `);
        expect(steps).toEqual([
            // create delivery, create handling units, link handling units
            // (variables generated by the database adapter have no origin)
            {},
            {},
            {},
            // createDelivery result
            {
                v_delivery1: 'createDelivery',
                v_handlingUnit1: 'createDelivery.handlingUnits',
            },
            // deleteConsignment: find ids, remove edges, remove consignment
            { v_consignment1: 'deleteConsignment' },
            {},
            { v_consignment1: 'deleteConsignment' },
            // final result
            {},
        ]);
    });

    it('does not change the generated AQL', async () => {
        const operations = [
            `query {
                allConsignments {
                    handlingUnits { huNumber delivery { deliveryNumber } }
                    a: deliveries(filter: { deliveryNumber: "D1" }) { deliveryNumber }
                    b: deliveries { consignment { consignmentNumber } }
                    items(filter: { itemNumber: "I1" }) { itemNumber }
                }
            }`,
            `query {
                flexSearchConsignments(flexSearchFilter: { consignmentNumber: "C1" }) {
                    deliveries { deliveryNumber }
                }
            }`,
            `mutation {
                createDelivery(input: {
                    deliveryNumber: "D3"
                    createHandlingUnits: [{ huNumber: "H3" }]
                }) {
                    handlingUnits { huNumber }
                }
            }`,
        ];
        const oldEnableIndentationForCode = aqlConfig.enableIndentationForCode;
        try {
            for (const operation of operations) {
                const plan = await execute(operation);
                // recordPlan enables indentation, so compare at the same setting
                aqlConfig.enableIndentationForCode = true;
                const queries = getAQLQuery(plan.queryTree)
                    .getExecutableQueries()
                    .map((q) => q.code);
                aqlConfig.enableIndentationForCode = oldEnableIndentationForCode;
                expect(queries).toEqual(plan.transactionSteps.map((s) => s.query));
            }
        } finally {
            aqlConfig.enableIndentationForCode = oldEnableIndentationForCode;
        }
    });
});
