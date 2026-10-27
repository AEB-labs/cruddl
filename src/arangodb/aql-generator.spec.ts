import { describe, expect, it } from 'vitest';
import { LiteralQueryNode } from '../core/query-tree/literals.js';
import { ObjectQueryNode, PropertySpecification } from '../core/query-tree/objects.js';
import { BinaryOperationQueryNode, BinaryOperator } from '../core/query-tree/operators.js';
import { QuantifierFilterNode } from '../core/query-tree/quantifiers.js';
import { VariableQueryNode } from '../core/query-tree/variables.js';
import { getAQLQuery } from './aql-generator.js';

describe('getAQLForQuery', () => {
    it('supports LiteralQuery', () => {
        const query = new LiteralQueryNode({ some: 'object' });
        const aql = getAQLQuery(query);
        expect(aql.getExecutableQueries()[0].code).to.equal(`RETURN @var1`);
    });

    it('supports ObjectQuery', () => {
        const query = new ObjectQueryNode([
            new PropertySpecification('propA', new LiteralQueryNode('a')),
            new PropertySpecification('propB', new LiteralQueryNode('b')),
        ]);
        const aql = getAQLQuery(query);
        expect(aql.getExecutableQueries()[0].code).to.equal(
            `RETURN {\n"propA": @var1,\n"propB": @var2\n}`,
        );
    });

    it('uses an inline filter for quantifiers with simple conditions', () => {
        const itemVariable = new VariableQueryNode('item');
        const query = new QuantifierFilterNode({
            listNode: new LiteralQueryNode(['a', 'b']),
            itemVariable,
            quantifier: 'every',
            conditionNode: new BinaryOperationQueryNode(
                itemVariable,
                BinaryOperator.IN,
                new LiteralQueryNode(['a']),
            ),
        });
        const aql = getAQLQuery(query);
        expect(aql.getExecutableQueries()[0].code).to.equal(
            `RETURN (LENGTH(@var1[* FILTER !((CURRENT IN @var2))]) == 0)`,
        );
    });

    it('uses a subquery for quantifiers with nested quantifiers', () => {
        // CURRENT would be ambiguous in nested inline filters
        const outerItemVariable = new VariableQueryNode('outer');
        const innerItemVariable = new VariableQueryNode('inner');
        const query = new QuantifierFilterNode({
            listNode: new LiteralQueryNode([['a'], ['b']]),
            itemVariable: outerItemVariable,
            quantifier: 'some',
            conditionNode: new QuantifierFilterNode({
                listNode: outerItemVariable,
                itemVariable: innerItemVariable,
                quantifier: 'some',
                conditionNode: new BinaryOperationQueryNode(
                    innerItemVariable,
                    BinaryOperator.EQUAL,
                    new LiteralQueryNode('a'),
                ),
            }),
        });
        const aql = getAQLQuery(query);
        const code = aql.getExecutableQueries()[0].code;
        expect(code).to.contain('FOR v_outer1');
        expect(code).to.contain('[* FILTER (CURRENT == @var2)]');
    });
});
