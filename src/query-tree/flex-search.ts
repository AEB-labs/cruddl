import { IDENTITY_ANALYZER } from '../database/arangodb/schema-migration/arango-search-helpers';
import { FlexSearchLanguage } from '../model/config';
import { RootEntityType } from '../model/implementation';
import { binaryOp } from '../schema-generation/utils/input-types';
import { decapitalize, indent } from '../utils/utils';
import { QueryNode } from './base';
import { ConstBoolQueryNode, LiteralQueryNode } from './literals';
import { BinaryOperator, BinaryOperatorWithAnalyzer, OperatorWithAnalyzerQueryNode } from './operators';
import { simplifyBooleans } from './utils';
import { VariableQueryNode } from './variables';

/**
 * A QueryNode that represents a FlexSearch Query on a RootEntity Type
 */
export class FlexSearchQueryNode extends QueryNode {
    public readonly flexFilterNode: QueryNode;
    public readonly rootEntityType: RootEntityType;
    public readonly itemVariable: VariableQueryNode;
    public readonly isOptimisationsDisabled: boolean;

    constructor(params: {
        rootEntityType: RootEntityType;
        flexFilterNode?: QueryNode;
        itemVariable?: VariableQueryNode;
        isOptimisationsDisabled?: boolean;
    }) {
        super();
        this.flexFilterNode = params.flexFilterNode || new ConstBoolQueryNode(true);
        this.itemVariable = params.itemVariable || new VariableQueryNode(decapitalize(params.rootEntityType.name));
        this.rootEntityType = params.rootEntityType;
        this.isOptimisationsDisabled = params.isOptimisationsDisabled || false;
    }

    describe(): string {
        return (
            `Use FlexSearch for ${this.rootEntityType!.name}` +
            ` with ${this.itemVariable.describe()} => \n` +
            indent(
                this.flexFilterNode.equals(ConstBoolQueryNode.TRUE) ? '' : `where ${this.flexFilterNode.describe()}\n`
            )
        );
    }
}

/**
 * A Query Node that represents a more complex FlexSearch expression (e.g. CONTAINS_ALL_WORDS) that requires a database request,
 * to tokenize the search expression, before the sub-tree for this expression can be built.
 */
export class FlexSearchComplexOperatorQueryNode extends QueryNode {
    constructor(
        readonly expression: string,
        readonly comparisonOperator: BinaryOperatorWithAnalyzer,
        readonly logicalOperator: BinaryOperator,
        private readonly fieldNode: QueryNode,
        readonly analyzer: string
    ) {
        super();
    }

    describe(): string {
        return `COMPLEX_OPERATOR(${this.comparisonOperator}, ${this.expression}, ${this.analyzer})`;
    }

    expand(tokenizations: ReadonlyArray<FlexSearchTokenization>): QueryNode {
        const tokenization = tokenizations.find(
            value => value.expression === this.expression && value.analyzer === this.analyzer
        );
        const tokens = tokenization ? tokenization.tokens : [];
        const neutralOperand =
            this.logicalOperator === BinaryOperator.AND ? ConstBoolQueryNode.TRUE : ConstBoolQueryNode.FALSE;
        return simplifyBooleans(
            tokens
                .map(
                    value =>
                        new OperatorWithAnalyzerQueryNode(
                            this.fieldNode,
                            this.comparisonOperator,
                            new LiteralQueryNode(value),
                            this.analyzer!
                        ) as QueryNode
                )
                .reduce(binaryOp(this.logicalOperator), neutralOperand)
        );
    }
}

export interface FlexSearchTokenization {
    expression: string;
    analyzer: string;
    tokens: ReadonlyArray<string>;
}

/**
 * A node that performs an EXISTS Check
 */
export class FlexSearchFieldExistsQueryNode extends QueryNode {
    constructor(public readonly sourceNode: QueryNode, public readonly analyzer?: string) {
        super();
    }

    describe() {
        return `EXISTS(${this.sourceNode.describe()}, ${this.analyzer ? this.analyzer.toString() : 'identity'})`;
    }
}

/**
 * A node that performs a FlexSearch STARTS_WITH Operation
 */
export class FlexSearchStartsWithQueryNode extends QueryNode {
    constructor(public readonly lhs: QueryNode, public readonly rhs: QueryNode, public readonly analyzer?: string) {
        super();
    }

    describe() {
        return `STARTS_WITH(${this.lhs.describe()},${this.rhs.describe()}, ${this.analyzer || IDENTITY_ANALYZER})`;
    }
}
