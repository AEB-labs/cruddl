import {QueryNode} from "./base";
import {RootEntityType} from "../model/implementation";
import {ConstBoolQueryNode} from "./literals";
import {VariableQueryNode} from "./variables";
import {decapitalize} from "../utils/utils";

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
        this.itemVariable = params.itemVariable || new VariableQueryNode(params.entity ? decapitalize(params.entity.name) : `quickSearchGlobal`); // @MSF TODO: variable Name
        this.isGlobal = params.isGlobal || false;
        this.entity = params.entity;
    }

    describe(): string {
        return ""; // @MSF TODO: describe QueryTree
    }

}