import { DatabaseAdapter } from '../database/database-adapter';
import { QuickSearchLanguage } from '../model/config';
import { and } from '../schema-generation/quick-search-filter-input-types/constants';
import { QueryNode } from './base';
import { RootEntityType } from '../model/implementation';
import { ConstBoolQueryNode, LiteralQueryNode } from './literals';
import { BinaryOperator, BinaryOperatorWithLanguage, OperatorWithLanguageQueryNode } from './operators';
import { simplifyBooleans } from './utils';
import { VariableQueryNode } from './variables';
import { decapitalize, flatMap, indent } from '../utils/utils';

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
        this.itemVariable = params.itemVariable || new VariableQueryNode(decapitalize(params.rootEntityType.name) );
        this.rootEntityType = params.rootEntityType;
    }

    describe(): string {
        return `Use QuickSearch for ${this.rootEntityType!.name}`
            + ` with ${this.itemVariable.describe()} => \n` + indent(
                (this.qsFilterNode.equals(ConstBoolQueryNode.TRUE) ? '' : `where ${this.qsFilterNode.describe()}\n`)
            );
    }

}

export abstract class ExpandingQueryNode extends QueryNode{
    abstract async expand(databaseAdapter: DatabaseAdapter):Promise<QueryNode>;
}

export class QuickSearchComplexOperatorQueryNode extends ExpandingQueryNode{

    constructor(
        private readonly expression: string,
        private readonly comparisonOperator: BinaryOperatorWithLanguage,
        private readonly logicalOperator: BinaryOperator,
        private readonly fieldNode: QueryNode,
        private readonly quickSearchLanguage?: QuickSearchLanguage) {
        super();
    }

    describe(): string {
        return `COMPLEX_OPERATOR(${this.comparisonOperator}, ${this.expression}, ${this.quickSearchLanguage})`;
    }

    async expand(databaseAdapter: DatabaseAdapter): Promise<QueryNode> {
        const tokens = await databaseAdapter.tokenizeExpression(this.expression, this.quickSearchLanguage);
        const neutralOperand = this.logicalOperator === BinaryOperator.AND ? ConstBoolQueryNode.TRUE : ConstBoolQueryNode.FALSE;
        return simplifyBooleans(tokens
            .map(value => new OperatorWithLanguageQueryNode(this.fieldNode, this.comparisonOperator, new LiteralQueryNode(value), this.quickSearchLanguage))
            .reduce(and, neutralOperand));
    }


}