import { RootEntityType } from '../implementation';
import { ValidationContext } from '../validation';
import { checkBusinessObject } from './check-business-object';
import { checkFlexSearchOnType } from './check-flex-search-on-type';
import { checkIndices } from './check-indices';
import { checkTtl } from './check-ttl';
import { checkVectorIndices } from './check-vector-indices';

export function checkRootEntityType(
    typeToCheck: RootEntityType,
    baselineType: RootEntityType,
    context: ValidationContext,
) {
    checkBusinessObject(typeToCheck, baselineType, context);
    checkTtl(typeToCheck, baselineType, context);
    checkFlexSearchOnType(typeToCheck, baselineType, context);
    checkIndices(typeToCheck, baselineType, context);
    checkVectorIndices(typeToCheck, baselineType, context);
}
