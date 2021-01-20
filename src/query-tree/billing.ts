import { QueryNode } from './base';

/**
 * A QueryNode that creates a Billing entry, or updates it if it already exists.
 */
export class CreateBillingEntityQueryNode extends QueryNode {
    readonly rootEntityTypeName: string;
    readonly key: number | string;
    readonly categoryNode: QueryNode;
    readonly quantityNode: QueryNode;

    constructor(params: {
        readonly rootEntityTypeName: string;
        readonly key: number | string;
        readonly categoryNode: QueryNode;
        readonly quantityNode: QueryNode;
    }) {
        super();
        this.rootEntityTypeName = params.rootEntityTypeName;
        this.key = params.key;
        this.categoryNode = params.categoryNode;
        this.quantityNode = params.quantityNode;
    }

    describe(): string {
        return `Create BillingEntry for ${this.rootEntityTypeName} with key "${
            this.key
        }", category "${this.categoryNode.describe()}", quantity "${this.quantityNode.describe()}"`;
    }
}

/**
 * A QueryNode that set the "isConfirmedForExport" and the "confirmedForExportAt" for a billingEntry
 */
export class ConfirmForBillingQueryNode extends QueryNode {
    readonly rootEntityTypeName: string;
    readonly keyNode: QueryNode;
    readonly categoryNode: QueryNode;
    readonly quantityNode: QueryNode;

    constructor(params: {
        readonly rootEntityTypeName: string;
        keyNode: QueryNode;
        readonly categoryNode: QueryNode;
        readonly quantityNode: QueryNode;
    }) {
        super();
        this.rootEntityTypeName = params.rootEntityTypeName;
        this.keyNode = params.keyNode;
        this.categoryNode = params.categoryNode;
        this.quantityNode = params.quantityNode;
    }

    describe(): string {
        return `Confirm BillingEntry for ${
            this.rootEntityTypeName
        } with key "${this.keyNode.describe()}", category "${this.categoryNode.describe()}", quantity "${this.quantityNode.describe()}"`;
    }
}
