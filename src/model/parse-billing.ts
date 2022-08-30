import { ParsedObjectProjectSource } from '../config/parsed-project';
import { BillingConfig } from './config/billing';

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
                keyFieldNameLoc:
                    source.pathLocationMap[`/billing/billingEntities/${index}/keyFieldName`],
                quantityFieldNameLoc:
                    source.pathLocationMap[`/billing/billingEntities/${index}/quantityFieldName`],
                categoryLoc: source.pathLocationMap[`/billing/billingEntities/${index}/category`],
                categoryMappingLoc:
                    source.pathLocationMap[`/billing/billingEntities/${index}/categoryMapping`],
                categoryMapping: value.categoryMapping
                    ? {
                          ...value.categoryMapping,
                          fieldNameLoc:
                              source.pathLocationMap[
                                  `/billing/billingEntities/${index}/categoryMapping/fieldName`
                              ],
                      }
                    : undefined,
            };
        }),
    };
}
