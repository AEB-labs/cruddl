import { QueryNode } from './base';
import { QuickSearchLanguage } from '../model/config';
import {
    INPUT_FIELD_CONTAINS_ALL_PREFIXES,
    INPUT_FIELD_CONTAINS_ALL_WORDS,
    INPUT_FIELD_CONTAINS_ANY_PREFIX, INPUT_FIELD_NOT_CONTAINS_ALL_PREFIXES,
    INPUT_FIELD_NOT_CONTAINS_ALL_WORDS, INPUT_FIELD_NOT_CONTAINS_ANY_PREFIX
} from '../schema/constants';

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

// @TODO: create own QuickSearchBinaryOperationQueryNode with all QS Operations
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
}

// @MSF TODO: name OperatorWithLanguage instead
/**
 * A node that performs an operation with two operands and a parameter
 */
export class TernaryOperationQueryNode extends QueryNode {
    constructor(public readonly lhs: QueryNode, public readonly operator: TernaryOperator, public readonly rhs: QueryNode, public readonly param?: QueryNode) {
        super();
    }

    describe() {
        return `(${this.lhs.describe()} ${this.describeOperator(this.operator)} ${this.rhs.describe()}${this.getParamString()})`;
    }

    private describeOperator(op: TernaryOperator) {
        switch (op) {
            case TernaryOperator.QUICKSEARCH_CONTAINS_ANY_WORD:
                return 'IN TOKENS';
            case TernaryOperator.QUICKSEARCH_STARTS_WITH:
                return 'STARTS_WITH';
            case TernaryOperator.QUICKSEARCH_CONTAINS_PHRASE:
                return 'CONTAINS_PHRASE';
            case TernaryOperator.QUICKSEARCH_CONTAINS_PREFIX:
                return 'CONTAINS_PREFIX';
            default:
                return '(unknown operator)';
        }
    }

    private getParamString() {
        if (this.param) {
            return ` with ${this.param.describe()}`;
        } else {
            return ``;
        }

    }
}

/**
 * The operator of a TernaryOperationQueryNode
 */
export enum TernaryOperator {
    QUICKSEARCH_STARTS_WITH = 'QUICKSEARCH_STARTS_WITH',
    QUICKSEARCH_CONTAINS_ANY_WORD = 'QUICKSEARCH_CONTAINS_ANY_WORD',
    QUICKSEARCH_CONTAINS_PREFIX = 'QUICKSEARCH_CONTAINS_PREFIX',
    QUICKSEARCH_CONTAINS_PHRASE = 'QUICKSEARCH_CONTAINS_PHRASE',
}

export class TextAnalyzerQueryNode extends QueryNode {
    constructor(public readonly language: QuickSearchLanguage) {
        super();
    }


    describe(): string {
        return `ANALYZER(${this.language})`;
    }
}

export class ConditionalQueryNode extends QueryNode {
    constructor(public readonly condition: QueryNode, public readonly expr1: QueryNode, public readonly expr2: QueryNode) {
        super();
    }

    describe() {
        return `(if ${this.condition.describe()} then ${this.expr1.describe()} else ${this.expr2.describe()} endif)`;
    }
}


