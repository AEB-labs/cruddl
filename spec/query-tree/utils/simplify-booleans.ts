import { expect } from 'chai';
import {
    BinaryOperationQueryNode, BinaryOperator, ConstBoolQueryNode, LiteralQueryNode, QueryNode, UnaryOperationQueryNode,
    UnaryOperator
} from '../../../src/query-tree';
import { simplifyBooleans } from '../../../src/query-tree/utils';

describe('query-tree-utils', () => {
    describe('simplifyBooleans', () => {
        describe('does not change value of', () => {
            function evaluate(op: QueryNode): boolean {
                if (op instanceof ConstBoolQueryNode) {
                    return op.value;
                }
                if (op instanceof LiteralQueryNode) {
                    return op.value;
                }
                if (op instanceof BinaryOperationQueryNode && op.operator == BinaryOperator.AND) {
                    return evaluate(op.lhs) && evaluate(op.rhs);
                }
                if (op instanceof BinaryOperationQueryNode && op.operator == BinaryOperator.OR) {
                    return evaluate(op.lhs) || evaluate(op.rhs);
                }
                if (op instanceof UnaryOperationQueryNode && op.operator == UnaryOperator.NOT) {
                    return !evaluate(op.valueNode);
                }
                throw new Error(`Unsupported node: ${op.constructor.name}`);
            }

            function not(value: QueryNode) {
                return new UnaryOperationQueryNode(value, UnaryOperator.NOT);
            }

            function and(lhs: QueryNode, rhs: QueryNode) {
                return new BinaryOperationQueryNode(lhs, BinaryOperator.AND, rhs);
            }

            function or(lhs: QueryNode, rhs: QueryNode) {
                return new BinaryOperationQueryNode(lhs, BinaryOperator.OR, rhs);
            }

            const TRUE = ConstBoolQueryNode.TRUE;
            const FALSE = ConstBoolQueryNode.FALSE;

            const testCases: Array<(var1: QueryNode) => QueryNode> = [
                () => TRUE,
                () => FALSE,
                () => not(TRUE),
                () => not(FALSE),
                var1 => var1,

                () => and(TRUE, TRUE),
                () => and(TRUE, FALSE),
                () => and(FALSE, TRUE),
                () => and(FALSE, FALSE),

                var1 => and(TRUE, var1),
                var1 => and(FALSE, var1),
                var1 => and(var1, TRUE),
                var1 => and(var1, FALSE),

                var1 => or(TRUE, var1),
                var1 => or(FALSE, var1),
                var1 => or(var1, TRUE),
                var1 => or(var1, FALSE),

                var1 => and(not(TRUE), not(var1)),
                var1 => and(not(FALSE), not(var1)),
                var1 => and(not(var1), not(TRUE)),
                var1 => and(not(var1), not(FALSE)),

                var1 => or(not(TRUE), not(var1)),
                var1 => or(not(FALSE), not(var1)),
                var1 => or(not(var1), not(TRUE)),
                var1 => or(not(var1), not(FALSE)),
            ];

            for (const testCase of testCases) {
                for (const varValue of [true, false]) {
                    const varNode = new LiteralQueryNode(varValue);
                    const testNode = testCase(varNode);
                    it(testNode.describe(), () => {
                        const expected = evaluate(testNode);
                        const simplified = simplifyBooleans(testNode);
                        const actual = evaluate(simplified);
                        expect(actual).to.equal(expected, 'simplification output: ' + simplified.describe());
                    });
                }
            }
        });
    });
});
