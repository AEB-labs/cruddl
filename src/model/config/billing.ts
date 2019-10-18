import { ASTNode } from 'graphql';
import { MessageLocation } from '../validation';

export interface BillingConfig {
    readonly billingEntities: ReadonlyArray<BillingEntityConfig>
}

export interface BillingEntityConfig {
    readonly typeName: string,
    readonly keyFieldName?: string
    readonly typeNameLoc: MessageLocation
    readonly keyFieldNameLoc: MessageLocation
}