
import { QueryNode } from './base';

// MSF TODO: comment
export class CreateBillingEntityQueryNode extends QueryNode{
    constructor(readonly keyFieldValue: number | string, readonly rootEntityTypeName: string) {
        super();
    }


    describe(): string {
        return ""; // MSF TODO: description
    }

}

// MSF TODO: comment
export class ApproveForBillingQueryNode extends QueryNode{

    describe(): string {
        return ""; // MSF TODO: description
    }

}
