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
    public readonly entity?: RootEntityType;
    public readonly itemVariable: VariableQueryNode;

    constructor(params: {
        entity?: RootEntityType,
        isGlobal?: boolean,
        qsFilterNode?: QueryNode,
        itemVariable?: VariableQueryNode
    }) {
        super();
        this.qsFilterNode = params.qsFilterNode || new ConstBoolQueryNode(true);
        this.itemVariable = params.itemVariable || new VariableQueryNode(params.entity ? decapitalize(params.entity.name) : `quickSearchGlobal`); // @MSF OPT TODO: constant variable Name
        this.isGlobal = params.isGlobal || false;
        this.entity = params.entity;
    }

    describe(): string {
        return this.isGlobal ? `Use GlobalQuickSearch` : `Use QuickSearch for ${this.entity!.name}`
            +` with ${this.itemVariable.describe()} => \n` + indent(
            (this.qsFilterNode.equals(ConstBoolQueryNode.TRUE) ? '' : `where ${this.qsFilterNode.describe()}\n`)
        ); // @MSF OPT TODO: describe QueryTree
    }

}

export class QuickSearchComplexFilterQueryNode extends QueryNode{

    // @MSF OPT TODO: extract this (no special QueryNode is required. just the filterNode needs to be created)

    public filterNode: QueryNode;

    constructor(comparisonOperator: TernaryOperator, logicalOperator: BinaryOperator, fieldNode: QueryNode, valueNode: QueryNode, paramNode?: QueryNode){
        super()
        if(!(valueNode instanceof LiteralQueryNode) || (typeof valueNode.value !== "string")){
            throw new Error("QuickSearchComplexFilterQueryNode requires a LiteralQueryNode with a string-value, as valueNode");
        }
        const tokens = this.tokenize(valueNode.value);
        const neutralOperand = logicalOperator === BinaryOperator.AND ? ConstBoolQueryNode.TRUE : ConstBoolQueryNode.FALSE
        this.filterNode = simplifyBooleans(tokens
            .map(value => new TernaryOperationQueryNode(fieldNode,comparisonOperator,new LiteralQueryNode(value),paramNode))
            .reduce(and,neutralOperand))
    }

    describe(): string {
        return "";
    }

    private tokenize(value: string): string[] {
        return flatMap(value.split(" "),t => t.split("-")) //  @MSF TODO: implement tokenization
    }
}