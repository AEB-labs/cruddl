import { ObjectType, RootEntityType } from '../implementation';
import { ValidationContext, ValidationMessage } from '../validation';
import { checkField } from './check-field';
import { getRequiredBySuffix } from './describe-module-specification';
import { checkBusinessObject } from './check-business-object';
import { checkTtl } from './check-ttl';
import { checkFlexSearchOnType } from './check-flex-search-on-type';
import { checkIndices } from './check-indices';

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
