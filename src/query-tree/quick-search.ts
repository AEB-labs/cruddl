import { QuickSearchLanguage } from '../model/config';
import { RootEntityType } from '../model/implementation';
import { and } from '../schema-generation/utils/input-types';
import { decapitalize, indent } from '../utils/utils';
import { QueryNode } from './base';
import { ConstBoolQueryNode, LiteralQueryNode } from './literals';
import { BinaryOperator, BinaryOperatorWithLanguage, OperatorWithLanguageQueryNode } from './operators';
import { simplifyBooleans } from './utils';
import { VariableQueryNode } from './variables';

/**
 * A QueryNode that represents a QuickSearch Query on a RootEntity Type
 */
export class QuickSearchQueryNode extends QueryNode {

    public readonly qsFilterNode: QueryNode;
    public readonly rootEntityType: RootEntityType;
    public readonly itemVariable: VariableQueryNode;

    constructor(params: {
        rootEntityType: RootEntityType,
        qsFilterNode?: QueryNode,
        itemVariable?: VariableQueryNode
    }) {
        super();
        this.qsFilterNode = params.qsFilterNode || new ConstBoolQueryNode(true);
        this.itemVariable = params.itemVariable || new VariableQueryNode(decapitalize(params.rootEntityType.name));
        this.rootEntityType = params.rootEntityType;
    }

    describe(): string {
        return `Use QuickSearch for ${this.rootEntityType!.name}`
            + ` with ${this.itemVariable.describe()} => \n` + indent(
                (this.qsFilterNode.equals(ConstBoolQueryNode.TRUE) ? '' : `where ${this.qsFilterNode.describe()}\n`)
            );
    }

}

/**
 * A Query Node that represents a more complex QuickSearch expression (e.g. CONTAINS_ALL_WORDS) that requires a database request,
 * to tokenize the search expression, before the sub-tree for this expression can be built.
 */
export class QuickSearchComplexOperatorQueryNode extends QueryNode {

    constructor(
        readonly expression: string,
        private readonly comparisonOperator: BinaryOperatorWithLanguage,
        private readonly logicalOperator: BinaryOperator,
        private readonly fieldNode: QueryNode,
        readonly quickSearchLanguage: QuickSearchLanguage) {
        super();
    }

    describe(): string {
        return `COMPLEX_OPERATOR(${this.comparisonOperator}, ${this.expression}, ${this.quickSearchLanguage})`;
    }

    expand(tokenizations: ReadonlyArray<QuickSearchTokenization>): QueryNode {
        const tokenization = tokenizations.find(value => value.expression === this.expression && value.language === this.quickSearchLanguage);
        const tokens = tokenization ? tokenization.tokens : [];
        const neutralOperand = this.logicalOperator === BinaryOperator.AND ? ConstBoolQueryNode.TRUE : ConstBoolQueryNode.FALSE;
        return simplifyBooleans(tokens
            .map(value => new OperatorWithLanguageQueryNode(this.fieldNode, this.comparisonOperator, new LiteralQueryNode(value), this.quickSearchLanguage) as QueryNode)
            .reduce(and, neutralOperand));
    }

}

export interface QuickSearchTokenization {
    expression: string
    language: QuickSearchLanguage
    tokens: ReadonlyArray<string>
}


/**
 * A node that performs an EXISTS Check
 */
export class QuickSearchFieldExistsQueryNode extends QueryNode {
    constructor(public readonly sourceNode: QueryNode, public readonly quickSearchLanguage?: QuickSearchLanguage) {
        super();
    }

    describe() {
        return `EXISTS(${this.sourceNode.describe()}, ${this.quickSearchLanguage ? this.quickSearchLanguage.toString() : 'identity'})`;
    }
}

/**
 * A node that performs a QuickSearch STARTS_WITH Operation
 */
export class QuickSearchStartsWithQueryNode extends QueryNode {
    constructor(public readonly lhs: QueryNode, public readonly rhs: QueryNode, public readonly quickSearchLanguage?: QuickSearchLanguage) {
        super();
    }

    describe() {
        return `STARTS_WITH(${this.lhs.describe()},${this.rhs.describe()}, ${this.quickSearchLanguage ? this.quickSearchLanguage.toString() : 'identity'})`;
    }
}