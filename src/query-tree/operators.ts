import { QueryNode } from './base';

/**
 * A node that performs an operation with one operand
 */
export class UnaryOperationQueryNode extends QueryNode {
    constructor(public readonly valueNode: QueryNode, public readonly operator: UnaryOperator) {
        super();
    }

    describe() {
        switch (this.operator) {
            case UnaryOperator.NOT:
                return `!(${this.valueNode.describe()})`;
            case UnaryOperator.JSON_STRINGIFY:
                return `JSON_STRINGIFY(${this.valueNode.describe()})`;
            default:
                return '(unknown operator)';
        }
    }
}

/**
 * The operator of a UnaryOperationQueryNode
 */
export enum UnaryOperator {
    NOT,
    JSON_STRINGIFY
}

/**
 * A node that performs an operation with two operands
 */
export class BinaryOperationQueryNode extends QueryNode {
    constructor(public readonly lhs: QueryNode, public readonly operator: BinaryOperator, public readonly rhs: QueryNode) {
        super();
    }

    describe() {
        return `(${this.lhs.describe()} ${this.describeOperator(this.operator)} ${this.rhs.describe()})`;
    }

    private describeOperator(op: BinaryOperator) {
        switch (op) {
            case BinaryOperator.AND:
                return '&&';
            case BinaryOperator.OR:
                return '&&';
            case BinaryOperator.EQUAL:
                return '==';
            case BinaryOperator.UNEQUAL:
                return '!=';
            case BinaryOperator.GREATER_THAN:
                return '>';
            case BinaryOperator.GREATER_THAN_OR_EQUAL:
                return '>=';
            case BinaryOperator.LESS_THAN:
                return '<';
            case BinaryOperator.LESS_THAN_OR_EQUAL:
                return '<=';
            case BinaryOperator.IN:
                return 'IN';
            case BinaryOperator.CONTAINS:
                return 'CONTAINS';
            case BinaryOperator.STARTS_WITH:
                return 'STARTS WITH';
            case BinaryOperator.ENDS_WITH:
                return 'ENDS WITH';
            case BinaryOperator.ADD:
                return '+';
            case BinaryOperator.SUBTRACT:
                return '-';
            case BinaryOperator.MULTIPLY:
                return '*';
            case BinaryOperator.DIVIDE:
                return '/';
            case BinaryOperator.MODULO:
                return '%';
            case BinaryOperator.APPEND:
                return 'APPEND';
            case BinaryOperator.PREPEND:
                return 'PREPEND';
            default:
                return '(unknown operator)';
        }
    }
}

/**
 * The operator of a BinaryOperationQueryNode
 */
export enum BinaryOperator {
    AND,
    OR,
    EQUAL,
    UNEQUAL,
    LESS_THAN,
    LESS_THAN_OR_EQUAL,
    GREATER_THAN,
    GREATER_THAN_OR_EQUAL,
    IN,
    CONTAINS,
    STARTS_WITH,
    ENDS_WITH,
    ADD,
    SUBTRACT,
    MULTIPLY,
    DIVIDE,
    MODULO,
    APPEND,
    PREPEND,
}

export class ConditionalQueryNode extends QueryNode {
    constructor(public readonly condition: QueryNode, public readonly expr1: QueryNode, public readonly expr2: QueryNode) {
        super();
    }

    describe() {
        return `(if ${this.condition.describe()} then ${this.expr1.describe()} else ${this.expr2.describe()} endif)`;
    }
}
