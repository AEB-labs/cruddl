import { gql } from 'graphql-tag';
import { describe, expect, it } from 'vitest';
import type { QueryNode } from '../../query-tree/base.js';
import { TransformListQueryNode } from '../../query-tree/lists.js';
import { LiteralQueryNode } from '../../query-tree/literals.js';
import {
    CreateEntityQueryNode,
    SetFieldQueryNode,
    UpdateEntitiesQueryNode,
} from '../../query-tree/mutations.js';
import { BinaryOperationQueryNode, BinaryOperator } from '../../query-tree/operators.js';
import { EntitiesQueryNode, FieldQueryNode } from '../../query-tree/queries.js';
import { VariableQueryNode } from '../../query-tree/variables.js';
import { createTempDatabase } from '../../testing/regression-tests/initialization.js';
import { createSimpleModel } from '../../testing/utils/create-simple-model.js';
import { range } from '../../utils/utils.js';
import { ArangoDBAdapter } from './arangodb-adapter.js';
import { isArangoDBDisabled } from './testing/is-arangodb-disabled.js';

const PARALLELISM = 20;

// this test is disabled because of its probabilistic nature
describe.skipIf(isArangoDBDisabled()).skip('ArangoDB retryOnConflict', () => {
    it('causes conflicts when retry is disabled', async () => {
        const { adapter, updateQuery } = await prepareAdapter(0);
        const result = await Promise.all(
            range(PARALLELISM).map(() => adapter.executeExt({ queryTree: updateQuery })),
        );
        expect(
            result.filter((r) => r.error && r.error.message.includes('conflict')).length,
        ).to.be.greaterThan(0);
    });

    it('causes no conflicts when retry is enabled', async () => {
        const { adapter, updateQuery } = await prepareAdapter(10);
        const result = await Promise.all(
            range(PARALLELISM).map(() =>
                adapter.executeExt({ queryTree: updateQuery, recordTimings: true }),
            ),
        );
        expect(
            result.filter((r) => r.error && r.error.message.includes('conflict')).length,
        ).to.equal(0);
        expect(
            result.map((r) => r.timings!.dbConnection.retryDelay).filter((time) => time > 0).length,
        ).to.be.greaterThan(0);
    });
});

async function prepareAdapter(
    maxRetries: number,
): Promise<{ adapter: ArangoDBAdapter; updateQuery: QueryNode }> {
    const dbConfig = await createTempDatabase();
    const KEY = 'delivery';
    const adapter = new ArangoDBAdapter({
        ...dbConfig,
        arangoJSConfig: {
            poolSize: PARALLELISM,
        },
        retriesOnConflict: maxRetries,
    });

    const model = createSimpleModel(gql`
        type NumberRange @rootEntity {
            key: String @key
            number: Int @calcMutations(operators: [ADD])
        }
    `);
    const numberRangeType = model.getRootEntityTypeOrThrow('NumberRange');
    const itemVariable = new VariableQueryNode('item');
    const numberField = numberRangeType.getFieldOrThrow('number');
    const keyField = numberRangeType.getKeyFieldOrThrow();
    const updateQuery = new UpdateEntitiesQueryNode({
        rootEntityType: numberRangeType,
        listNode: new TransformListQueryNode({
            itemVariable,
            listNode: new EntitiesQueryNode(numberRangeType),
            filterNode: new BinaryOperationQueryNode(
                new FieldQueryNode(itemVariable, keyField),
                BinaryOperator.EQUAL,
                new LiteralQueryNode(KEY),
            ),
        }),
        currentEntityVariable: itemVariable,
        updates: [
            new SetFieldQueryNode(
                numberField,
                new BinaryOperationQueryNode(
                    new FieldQueryNode(itemVariable, numberField),
                    BinaryOperator.ADD,
                    new LiteralQueryNode(1),
                ),
            ),
        ],
        affectedFields: [],
    });

    await adapter.updateSchema(model);

    await adapter.execute(
        new CreateEntityQueryNode(
            numberRangeType,
            new LiteralQueryNode({
                key: KEY,
                number: 0,
            }),
            [],
        ),
    );

    return { adapter, updateQuery };
}
