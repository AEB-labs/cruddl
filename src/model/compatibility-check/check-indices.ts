import { EnumType, RootEntityType } from '../implementation';
import { ValidationContext, ValidationMessage } from '../validation';
import { getRequiredBySuffix } from './describe-module-specification';

export function checkIndices(
    typeToCheck: RootEntityType,
    baselineType: RootEntityType,
    context: ValidationContext,
) {
    // use index config instead of indices because there is a transformation step that changes
    // indices and also adds new indices. It would be confusing report issues for these.
    for (const index of baselineType.indexConfigs) {
    }
}
