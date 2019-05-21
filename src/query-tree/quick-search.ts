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
    public readonly isGlobal: boolean;
    public readonly rootEntityType: RootEntityType;
    public readonly itemVariable: VariableQueryNode;

    constructor(params: {
        rootEntityType: RootEntityType,
        isGlobal?: boolean,
        qsFilterNode?: QueryNode,
        itemVariable?: VariableQueryNode
    }) {
        super();
        this.qsFilterNode = params.qsFilterNode || new ConstBoolQueryNode(true);
        this.itemVariable = params.itemVariable || new VariableQueryNode(params.rootEntityType ? decapitalize(params.rootEntityType.name) : `quickSearchGlobal`); // @MSF GLOBAL TODO: constant variable Name
        this.isGlobal = params.isGlobal || false;
        this.rootEntityType = params.rootEntityType;
    }

    describe(): string {
        return this.isGlobal ? `Use GlobalQuickSearch` : `Use QuickSearch for ${this.rootEntityType!.name}`
            + ` with ${this.itemVariable.describe()} => \n` + indent(
                (this.qsFilterNode.equals(ConstBoolQueryNode.TRUE) ? '' : `where ${this.qsFilterNode.describe()}\n`)
            );
    }

}
