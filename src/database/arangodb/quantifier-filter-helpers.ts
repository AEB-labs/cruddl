import { Field } from '../../model/implementation/field.js';
import { QueryNode } from '../../query-tree/base.js';
import { LiteralQueryNode } from '../../query-tree/literals.js';
import { BinaryOperationQueryNode, BinaryOperator } from '../../query-tree/operators.js';
import { QuantifierFilterNode } from '../../query-tree/quantifiers.js';
import { FieldQueryNode } from '../../query-tree/queries.js';
import { SafeListQueryNode } from '../../query-tree/type-check.js';
import { simplifyBooleans } from '../../query-tree/utils/simplify-booleans.js';
import { isStringCaseInsensitive } from '../../utils/string-utils.js';
import { analyzeLikePatternPrefix } from '../like-helpers.js';

export interface CanUseArrayExpansionOperatorForQuantifierFilterResult {
    /**
     * The effective operator to use
     *
     * Can differ from the operator in the condition node for LIKE patterns that can be optimized as
     * equality checks (e.g. "abc%" can be optimized as "== 'abc'")
     */
    readonly operator: BinaryOperator;

    /**
     * The fields to access on the item variable (e.g. for items[*].field1.field2, this would be ["field1", "field2"])
     */
    readonly fields: ReadonlyArray<Field>;

    /**
     * The effective right-hand side operand
     */
    readonly valueNode: QueryNode;
}

/**
 * Checks whether a quantifier filter can be implemented using the array expansion operator (e.g. items[*].field ALL> 5)
 *
 * If this function returns undefined, the quantifier filter cannot be optimized with the array expansion operator.
 */
export function canUseArrayExpansionOperatorForQuantifierFilter(
    node: QuantifierFilterNode,
): CanUseArrayExpansionOperatorForQuantifierFilterResult | undefined {
    // ArangoDB supports array comparison operators (e.g. field ALL > 5)
    // https://www.arangodb.com/docs/stable/aql/operators.html#array-comparison-operators
    // it can be combined with the array expansion operator (e.g. items[*].field)
    // https://docs.arangodb.com/3.0/AQL/Advanced/ArrayOperators.html#array-expansion
    // quantifier filters with exactly one filter field that uses a comparison operator can be optimized with this
    // this simplifies the AQL expression a lot (no filtering-then-checking-length), and also enables early pruning

    const listNode =
        node.listNode instanceof SafeListQueryNode ? node.listNode.sourceNode : node.listNode;
    if (!(listNode instanceof FieldQueryNode)) {
        return undefined;
    }

    const conditionNode = simplifyBooleans(node.conditionNode);
    if (!(conditionNode instanceof BinaryOperationQueryNode)) {
        return undefined;
    }

    let fields: Field[] = [];
    let currentFieldNode: QueryNode = conditionNode.lhs;
    while (currentFieldNode !== node.itemVariable) {
        if (!(currentFieldNode instanceof FieldQueryNode)) {
            return undefined;
        }
        fields.unshift(currentFieldNode.field); // we're traversing from back to front
        currentFieldNode = currentFieldNode.objectNode;
    }

    const valueNode = conditionNode.rhs;

    switch (conditionNode.operator) {
        case BinaryOperator.EQUAL:
        case BinaryOperator.IN:
        case BinaryOperator.UNEQUAL:
        case BinaryOperator.LESS_THAN:
        case BinaryOperator.LESS_THAN_OR_EQUAL:
        case BinaryOperator.GREATER_THAN:
        case BinaryOperator.GREATER_THAN_OR_EQUAL:
            return {
                operator: conditionNode.operator,
                fields,
                valueNode,
            };

        case BinaryOperator.LIKE:
            // see if this really is an equals search so we can optimize it (only possible as long as it does not contain any case-specific characters)
            if (
                !(conditionNode.rhs instanceof LiteralQueryNode) ||
                typeof conditionNode.rhs.value !== 'string'
            ) {
                return undefined;
            }

            const likePattern: string = conditionNode.rhs.value;
            const { isLiteralPattern } = analyzeLikePatternPrefix(likePattern);
            if (!isLiteralPattern || !isStringCaseInsensitive(likePattern)) {
                return undefined;
            }

            return {
                operator: BinaryOperator.EQUAL,
                fields,
                valueNode,
            };

        default:
            return undefined;
    }
}
