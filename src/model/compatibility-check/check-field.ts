import { Field } from '../implementation';
import { ValidationContext } from '../validation';
import { checkCalcMutations } from './check-calc-mutations';
import { checkCollectField } from './check-collect-field';
import { checkDefaultValue } from './check-default-value';
import { checkFieldType } from './check-field-type';
import { checkKeyField } from './check-key-field';
import { checkReference } from './check-reference';
import { checkRelation } from './check-relation';
import { checkRootAndParentDirectives } from './check-root-and-parent-directives';
import { checkFlexSearchOnField } from './check-flex-search-on-field';

export function checkField(fieldToCheck: Field, baselineField: Field, context: ValidationContext) {
    checkFieldType(fieldToCheck, baselineField, context);
    checkKeyField(fieldToCheck, baselineField, context);
    checkReference(fieldToCheck, baselineField, context);
    checkRelation(fieldToCheck, baselineField, context);
    checkCollectField(fieldToCheck, baselineField, context);
    checkDefaultValue(fieldToCheck, baselineField, context);
    checkCalcMutations(fieldToCheck, baselineField, context);
    checkRootAndParentDirectives(fieldToCheck, baselineField, context);
    checkFlexSearchOnField(fieldToCheck, baselineField, context);
}
