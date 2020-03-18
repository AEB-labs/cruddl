import { ParsedObjectProjectSource } from '../config/parsed-project';
import { LocalizationConfig, NamespaceLocalizationConfig } from './config';
import { BillingConfig, BillingEntityConfig } from './config/billing';

export function parseBillingConfigs(source: ParsedObjectProjectSource): BillingConfig {
    if (!source.object || !source.object.billing || typeof source.object.billing !== 'object') {
        return { billingEntities: [] };
    }
    const billing = source.object.billing as BillingConfig;
    return {
        ...billing,
        billingEntities: billing.billingEntities.map((value, index) => {
            return {
                ...value,
                typeNameLoc: source.pathLocationMap[`/billing/billingEntities/${index}/typeName`],
                keyFieldNameLoc: source.pathLocationMap[`/billing/billingEntities/${index}/keyField`]
            };
        })
    };
}
