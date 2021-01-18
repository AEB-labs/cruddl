import { MessageLocation } from '../validation';

export interface BillingConfig {
    readonly billingEntities: ReadonlyArray<BillingEntityConfig>;
}

export interface BillingEntityConfig {
    readonly typeName: string;
    readonly typeNameLoc: MessageLocation;

    readonly keyFieldName?: string;
    readonly keyFieldNameLoc: MessageLocation;

    readonly quantityFieldName?: string;
    readonly quantityFieldNameLoc?: MessageLocation;

    readonly category?: string;
    readonly categoryLoc?: MessageLocation;

    readonly categoryMapping?: BillingEntityCategoryMappingConfig;
    readonly categoryMappingLoc?: MessageLocation;
}

export interface BillingEntityCategoryMappingConfig {
    readonly fieldName: string;
    readonly fieldNameLoc: MessageLocation;

    readonly values: { readonly [key: string]: string };

    readonly defaultValue: string;
}
