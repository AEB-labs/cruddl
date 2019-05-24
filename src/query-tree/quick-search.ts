import { QueryNode } from './base';
import { RootEntityType } from '../model/implementation';
import { ConstBoolQueryNode, LiteralQueryNode } from './literals';
import { VariableQueryNode } from './variables';
import { decapitalize, flatMap, indent } from '../utils/utils';
import { BinaryOperator, OperatorWithLanguageQueryNode, BinaryOperatorWithLanguage } from './operators';
import { and } from '../schema-generation/quick-search-filter-input-types/constants';
import { simplifyBooleans } from './utils';

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
