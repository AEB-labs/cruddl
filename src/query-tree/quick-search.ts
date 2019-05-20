import {QueryNode} from "./base";
import {RootEntityType} from "../model/implementation";
import {ConstBoolQueryNode, LiteralQueryNode} from "./literals";
import {VariableQueryNode} from "./variables";
import {decapitalize, flatMap, indent} from "../utils/utils";
import {BinaryOperator, TernaryOperationQueryNode, TernaryOperator} from "./operators";
import {and} from "../schema-generation/quick-search-filter-input-types/constants";
import {simplifyBooleans} from "./utils";

export class QuickSearchQueryNode extends QueryNode{

    public readonly qsFilterNode: QueryNode;
    public readonly isGlobal: boolean;
    public readonly entity?: RootEntityType; // @MSF TODO: not optional (is only optional because of global search) and rename to rootEntityType
    public readonly itemVariable: VariableQueryNode;

    constructor(params: {
        entity?: RootEntityType,
        isGlobal?: boolean,
        qsFilterNode?: QueryNode,
        itemVariable?: VariableQueryNode
    }) {
        super();
        this.qsFilterNode = params.qsFilterNode || new ConstBoolQueryNode(true);
        this.itemVariable = params.itemVariable || new VariableQueryNode(params.entity ? decapitalize(params.entity.name) : `quickSearchGlobal`); // @MSF GLOBAL TODO: constant variable Name
        this.isGlobal = params.isGlobal || false;
        this.entity = params.entity;
    }

    describe(): string {
        return this.isGlobal ? `Use GlobalQuickSearch` : `Use QuickSearch for ${this.entity!.name}`
            +` with ${this.itemVariable.describe()} => \n` + indent(
            (this.qsFilterNode.equals(ConstBoolQueryNode.TRUE) ? '' : `where ${this.qsFilterNode.describe()}\n`)
        );
    }

    containsQuickSearchNodes(): boolean {
        return true;
    }

}
