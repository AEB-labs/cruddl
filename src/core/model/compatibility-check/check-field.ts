import type { Field } from '../implementation/field.js';
import type { ValidationContext } from '../validation/validation-context.js';
import { checkCalcMutations } from './check-calc-mutations.js';
import { checkCollectField } from './check-collect-field.js';
import { checkDefaultValue } from './check-default-value.js';
import { checkFieldType } from './check-field-type.js';
import { checkFlexSearchOnField } from './check-flex-search-on-field.js';
import { checkKeyField } from './check-key-field.js';
import { checkReference } from './check-reference.js';
import { checkRelation } from './check-relation.js';
import { checkRootAndParentDirectives } from './check-root-and-parent-directives.js';
import { checkVectorIndex } from './check-vector-indices.js';

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
    checkVectorIndex(fieldToCheck, baselineField, context);
}
