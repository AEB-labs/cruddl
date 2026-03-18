import type { RootEntityType } from '../implementation/root-entity-type.js';
import type { ValidationContext } from '../validation/validation-context.js';
import { checkBusinessObject } from './check-business-object.js';
import { checkFlexSearchOnType } from './check-flex-search-on-type.js';
import { checkIndices } from './check-indices.js';
import { checkTtl } from './check-ttl.js';

export function checkRootEntityType(
    typeToCheck: RootEntityType,
    baselineType: RootEntityType,
    context: ValidationContext,
) {
    checkBusinessObject(typeToCheck, baselineType, context);
    checkTtl(typeToCheck, baselineType, context);
    checkFlexSearchOnType(typeToCheck, baselineType, context);
    checkIndices(typeToCheck, baselineType, context);
}
