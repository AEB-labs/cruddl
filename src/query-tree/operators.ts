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
            case UnaryOperator.ROUND:
                return `ROUND(${this.valueNode.describe()})`;
            default:
                return '(unknown operator)';
        }
    }
}

/**
 * The operator of a UnaryOperationQueryNode
 */
export enum UnaryOperator {
    NOT = 'NOT',
    JSON_STRINGIFY = 'JSON_STRINGIFY',
    ROUND = 'ROUND',
}

/**
 * A node that performs an operation with two operands
 */
export class BinaryOperationQueryNode extends QueryNode {
    constructor(
        public readonly lhs: QueryNode,
        public readonly operator: BinaryOperator,
        public readonly rhs: QueryNode
    ) {
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
                return '||';
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
            case BinaryOperator.LIKE:
                return 'LIKE';
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
            case BinaryOperator.SUBTRACT_LISTS:
                return 'SUBTRACT_LISTS';
            default:
                return '(unknown operator)';
        }
    }
}

/**
 * The operator of a BinaryOperationQueryNode
 */
export enum BinaryOperator {
    AND = 'AND',
    OR = 'OR',

    /**
     * Strict equality (values of different types are considered unequal)
     */
    EQUAL = 'EQUAL',

    /**
     * Strict inequality (values of different types are considered unequal)
     */
    UNEQUAL = 'UNEQUAL',

    LESS_THAN = 'LESS_THAN',
    LESS_THAN_OR_EQUAL = 'LESS_THAN_OR_EQUAL',
    GREATER_THAN = 'GREATER_THAN',
    GREATER_THAN_OR_EQUAL = 'GREATER_THAN_OR_EQUAL',

    IN = 'IN',
    CONTAINS = 'CONTAINS',
    STARTS_WITH = 'STARTS_WITH',
    ENDS_WITH = 'ENDS_WITH',

    /**
     * Comparison for string using placeholders (% for arbitrary char sequences, _ for a single character).
     * Case-insensitive. Use backslashes to escape %, _ and \
     */
    LIKE = 'LIKE',
    ADD = 'ADD',
    SUBTRACT = 'SUBTRACT',
    MULTIPLY = 'MULTIPLY',
    DIVIDE = 'DIVIDE',
    MODULO = 'MODULO',
    APPEND = 'APPEND',
    PREPEND = 'PREPEND',

    /**
     * Calculates the asymmetric difference between two lists
     */
    SUBTRACT_LISTS = 'SUBTRACT_LISTS',
}

/**
 * A node that performs an operation with two operands and a FlexSearch Analyzer
 */
export class OperatorWithAnalyzerQueryNode extends QueryNode {
    constructor(
        public readonly lhs: QueryNode,
        public readonly operator: BinaryOperatorWithAnalyzer,
        public readonly rhs: QueryNode,
        public readonly analyzer: string
    ) {
        super();
    }

    describe() {
        return `(${this.lhs.describe()} ${this.describeOperator(
            this.operator
        )} ${this.rhs.describe()} with analyzer: "${this.analyzer}")`;
    }

    private describeOperator(op: BinaryOperatorWithAnalyzer) {
        switch (op) {
            case BinaryOperatorWithAnalyzer.FLEX_SEARCH_CONTAINS_ANY_WORD:
                return 'IN TOKENS';
            case BinaryOperatorWithAnalyzer.FLEX_SEARCH_CONTAINS_PHRASE:
                return 'CONTAINS_PHRASE';
            case BinaryOperatorWithAnalyzer.FLEX_SEARCH_CONTAINS_PREFIX:
                return 'CONTAINS_PREFIX';
            // TODO: add remaining Operators
            default:
                return '(unknown operator)';
        }
    }
}

/**
 * The operator of a OperatorWithAnalyzerQueryNode
 */
export enum BinaryOperatorWithAnalyzer {
    FLEX_SEARCH_CONTAINS_ANY_WORD = 'FLEX_SEARCH_CONTAINS_ANY_WORD',
    FLEX_SEARCH_CONTAINS_PREFIX = 'FLEX_SEARCH_CONTAINS_PREFIX',
    FLEX_SEARCH_CONTAINS_PHRASE = 'FLEX_SEARCH_CONTAINS_PHRASE',

    // these don't support NULL - both operands need to be of the same type.
    FLEX_STRING_LESS_THAN = 'FLEX_STRING_LESS_THAN',
    FLEX_STRING_LESS_THAN_OR_EQUAL = 'FLEX_STRING_LESS_THAN_OR_EQUAL',
    FLEX_STRING_GREATER_THAN = 'FLEX_STRING_GREATER_THAN',
    FLEX_STRING_GREATER_THAN_OR_EQUAL = 'FLEX_STRING_GREATER_THAN_OR_EQUAL',

    /**
     * Strict equality (values of different types are considered unequal)
     */
    EQUAL = 'EQUAL',

    /**
     * Strict inequality (values of different types are considered unequal)
     */
    UNEQUAL = 'UNEQUAL',
    IN = 'IN',
}

export class ConditionalQueryNode extends QueryNode {
    constructor(
        public readonly condition: QueryNode,
        public readonly expr1: QueryNode,
        public readonly expr2: QueryNode
    ) {
        super();
    }

    describe() {
        return `(if ${this.condition.describe()} then ${this.expr1.describe()} else ${this.expr2.describe()} endif)`;
    }
}
