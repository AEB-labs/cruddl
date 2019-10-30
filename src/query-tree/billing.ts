import { QueryNode } from './base';

/**
 * A QueryNode that creates a Billing entry.
 */
export class CreateBillingEntityQueryNode extends QueryNode {
    constructor(readonly keyFieldValue: number | string, readonly rootEntityTypeName: string) {
        super();
    }


    describe(): string {
        return `Create BillingEntry for ${this.rootEntityTypeName} with key "${this.keyFieldValue}"`;
    }

}

/**
 * A QueryNode that set the "isConfirmedForExport" and the "confirmedForExportTimestamp" for a billingEntry
 */
export class ConfirmForBillingQueryNode extends QueryNode {

    constructor(readonly keyFieldValue: number | string, readonly rootEntityTypeName: string) {
        super();
    }

    describe(): string {
        return `Confirm BillingEntry for ${this.rootEntityTypeName} with key "${this.keyFieldValue}"`;
    }

}
