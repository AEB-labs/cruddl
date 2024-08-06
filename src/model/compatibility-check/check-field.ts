import { print, valueFromAST } from 'graphql';
import { CALC_MUTATIONS_OPERATORS_ARG, ID_FIELD } from '../../schema/constants';
import { RelationDeleteAction } from '../config/field';
import { Field } from '../implementation';
import { ValidationContext, ValidationMessage } from '../validation';
import { getRequiredBySuffix } from './describe-module-specification';
import { createValueNodeFromValue } from '../../graphql/value-to-ast';
import { isDeepStrictEqual } from 'util';

export function checkField(fieldToCheck: Field, baselineField: Field, context: ValidationContext) {
    checkTypeAndList(fieldToCheck, baselineField, context);
    checkKeyField(fieldToCheck, baselineField, context);
    checkReference(fieldToCheck, baselineField, context);
    checkRelation(fieldToCheck, baselineField, context);
    checkCollectField(fieldToCheck, baselineField, context);
    checkDefaultValue(fieldToCheck, baselineField, context);
    checkCalcMutations(fieldToCheck, baselineField, context);
}

function checkTypeAndList(fieldToCheck: Field, baselineField: Field, context: ValidationContext) {
    if (fieldToCheck.type.name !== baselineField.type.name) {
        const expectedType = baselineField.isList
            ? '[' + baselineField.type.name + ']'
            : baselineField.type.name;
        context.addMessage(
            ValidationMessage.compatibilityIssue(
                `Field "${baselineField.declaringType.name}.${
                    baselineField.name
                }" needs to be of type "${expectedType}"${getRequiredBySuffix(baselineField)}.`,
                fieldToCheck.astNode?.type,
            ),
        );
    } else if (fieldToCheck.isList && !baselineField.isList) {
        context.addMessage(
            ValidationMessage.compatibilityIssue(
                `Field "${baselineField.declaringType.name}.${
                    baselineField.name
                }" should not be a list${getRequiredBySuffix(baselineField)}.`,
                fieldToCheck.astNode?.type,
            ),
        );
    } else if (!fieldToCheck.isList && baselineField.isList) {
        context.addMessage(
            ValidationMessage.compatibilityIssue(
                `Field "${baselineField.declaringType.name}.${
                    baselineField.name
                }" needs to be a list${getRequiredBySuffix(baselineField)}.`,
                fieldToCheck.astNode?.type,
            ),
        );
    }
}

function checkKeyField(fieldToCheck: Field, baselineField: Field, context: ValidationContext) {
    const baselineFieldIsKeyField =
        baselineField.declaringType.isRootEntityType &&
        baselineField.declaringType.keyField === baselineField;
    const fieldToCheckIsKeyield =
        fieldToCheck.declaringType.isRootEntityType &&
        fieldToCheck.declaringType.keyField === fieldToCheck;
    if (baselineFieldIsKeyField && !fieldToCheckIsKeyield) {
        // special case: If the baseline requires id: ID @key, the fieldToCheck might not be authored at all
        // (because it's an automatic system field). We need to tell the user that the field needs to be added.
        if (fieldToCheck.isSystemField && fieldToCheck.name === ID_FIELD && !fieldToCheck.astNode) {
            context.addMessage(
                ValidationMessage.compatibilityIssue(
                    `Field "id: ID @key" needs to be specified${getRequiredBySuffix(
                        baselineField,
                    )}.`,
                    fieldToCheck.declaringType.nameASTNode,
                ),
            );
        } else {
            context.addMessage(
                ValidationMessage.compatibilityIssue(
                    `Field "${baselineField.declaringType.name}.${
                        baselineField.name
                    }" needs to be decorated with @key${getRequiredBySuffix(baselineField)}.`,
                    fieldToCheck.astNode,
                ),
            );
        }
    }
}

function checkReference(fieldToCheck: Field, baselineField: Field, context: ValidationContext) {
    if (fieldToCheck.isReference && !baselineField.isReference) {
        context.addMessage(
            ValidationMessage.compatibilityIssue(
                `Field "${baselineField.declaringType.name}.${
                    baselineField.name
                }" should not be a reference${getRequiredBySuffix(baselineField)}.`,
                fieldToCheck.referenceAstNode ?? fieldToCheck.astNode,
            ),
        );
        return;
    }

    // no reference on either side
    if (!baselineField.isReference) {
        return;
    }

    const expectedKeyFieldDeclaration =
        baselineField.referenceKeyField && baselineField.referenceKeyField !== baselineField
            ? `keyField: "${baselineField.referenceKeyField.name}"`
            : '';
    const expectedReferenceDeclaration = expectedKeyFieldDeclaration
        ? `@reference(${expectedKeyFieldDeclaration})`
        : `@reference`;

    // missing reference
    if (!fieldToCheck.isReference) {
        context.addMessage(
            ValidationMessage.compatibilityIssue(
                `Field "${baselineField.declaringType.name}.${
                    baselineField.name
                }" should be decorated with ${expectedReferenceDeclaration}${getRequiredBySuffix(
                    baselineField,
                )}.`,
                fieldToCheck.astNode,
            ),
        );
        return;
    }

    // superfluous key field
    // field.referenceKeyField === field means no keyField arg is present
    if (
        fieldToCheck.referenceKeyField !== fieldToCheck &&
        baselineField.referenceKeyField === baselineField
    ) {
        context.addMessage(
            ValidationMessage.compatibilityIssue(
                `Reference should not declare a keyField${getRequiredBySuffix(baselineField)}.`,
                fieldToCheck.referenceAstNode,
            ),
        );
        return;
    }

    if (baselineField.referenceKeyField === baselineField) {
        return;
    }

    // missing or wrong key field
    if (
        fieldToCheck.getReferenceKeyFieldOrThrow().name !==
        baselineField.getReferenceKeyFieldOrThrow().name
    ) {
        context.addMessage(
            ValidationMessage.compatibilityIssue(
                `Reference should declare ${expectedKeyFieldDeclaration}${getRequiredBySuffix(
                    baselineField,
                )}.`,
                fieldToCheck.referenceAstNode,
            ),
        );
    }
}

function checkRelation(fieldToCheck: Field, baselineField: Field, context: ValidationContext) {
    // superfluous relation
    if (fieldToCheck.isRelation && !baselineField.isRelation) {
        context.addMessage(
            ValidationMessage.compatibilityIssue(
                `Field "${baselineField.declaringType.name}.${
                    baselineField.name
                }" should not be a relation${getRequiredBySuffix(baselineField)}.`,
                fieldToCheck.relationAstNode ?? fieldToCheck.astNode,
            ),
        );
        return;
    }

    // no relation on either side
    if (!baselineField.isRelation) {
        return;
    }

    const expectedInverseOfDeclaration = baselineField.inverseOf
        ? `inverseOf: "${baselineField.inverseOf.name}"`
        : '';
    const expectedOnDeleteDeclaration =
        baselineField.relationDeleteAction === RelationDeleteAction.REMOVE_EDGES
            ? ''
            : `onDelete: ${baselineField.relationDeleteAction.toString()}`;

    // missing relation
    if (!fieldToCheck.isRelation) {
        const expectedRelationDeclaration =
            expectedInverseOfDeclaration && expectedOnDeleteDeclaration
                ? `@relation(${expectedInverseOfDeclaration} ${expectedOnDeleteDeclaration})`
                : expectedInverseOfDeclaration || expectedOnDeleteDeclaration
                ? `@relation(${expectedInverseOfDeclaration}${expectedOnDeleteDeclaration})`
                : `@relation`;
        context.addMessage(
            ValidationMessage.compatibilityIssue(
                `Field "${baselineField.declaringType.name}.${
                    baselineField.name
                }" should be decorated with ${expectedRelationDeclaration}${getRequiredBySuffix(
                    baselineField,
                )}.`,
                fieldToCheck.astNode,
            ),
        );
        return;
    }

    // superfluous inverseOf
    if (fieldToCheck.inverseOf && !baselineField.inverseOf) {
        context.addMessage(
            ValidationMessage.compatibilityIssue(
                `Relation "${
                    baselineField.name
                }" should be a forward relation, not an inverse relation${getRequiredBySuffix(
                    baselineField,
                )}.`,
                fieldToCheck.inverseOfAstNode ?? fieldToCheck.astNode,
            ),
        );
    }

    // missing or wrong inverseOf
    if (
        baselineField.inverseOf &&
        (!fieldToCheck.inverseOf || fieldToCheck.inverseOf.name !== baselineField.inverseOf.name)
    ) {
        context.addMessage(
            ValidationMessage.compatibilityIssue(
                `Relation "${
                    baselineField.name
                }" should be an inverse relation with ${expectedInverseOfDeclaration}${getRequiredBySuffix(
                    baselineField,
                )}.`,
                fieldToCheck.inverseOfAstNode ??
                    fieldToCheck.relationAstNode ??
                    fieldToCheck.astNode,
            ),
        );
    }

    // wrong onDelete
    if (fieldToCheck.relationDeleteAction !== baselineField.relationDeleteAction) {
        // technically you can specify REMOVE_EDGES, but that's the default and nobody specifies that
        const hint = expectedOnDeleteDeclaration
            ? `specify ${expectedOnDeleteDeclaration}`
            : `omit the "onDelete" argument`;
        context.addMessage(
            ValidationMessage.compatibilityIssue(
                `Relation "${baselineField.name}" should ${hint}${getRequiredBySuffix(
                    baselineField,
                )}.`,
                fieldToCheck.relationDeleteActionAstNode ??
                    fieldToCheck.relationAstNode ??
                    fieldToCheck.astNode,
            ),
        );
    }
}

function checkCollectField(fieldToCheck: Field, baselineField: Field, context: ValidationContext) {
    // superfluous @collect
    if (fieldToCheck.isCollectField && !baselineField.isCollectField) {
        context.addMessage(
            ValidationMessage.compatibilityIssue(
                `Field "${baselineField.declaringType.name}.${
                    baselineField.name
                }" should not be a collect field${getRequiredBySuffix(baselineField)}.`,
                fieldToCheck.collectAstNode,
            ),
        );
        return;
    }

    // no collect field on either side
    if (!baselineField.isCollectField) {
        return;
    }

    const expectedAggregateDeclaration = baselineField.aggregationOperator
        ? `aggregate: ${baselineField.aggregationOperator.toString()}`
        : '';

    // missing @collect
    if (!fieldToCheck.isCollectField) {
        const expectedPathDeclaration = `path: "${baselineField.collectPath?.path ?? ''}"`;
        const expectedCollectDeclaration = `@collect(${expectedPathDeclaration}${
            expectedAggregateDeclaration ? ', ' + expectedAggregateDeclaration : ''
        })`;
        context.addMessage(
            ValidationMessage.compatibilityIssue(
                `Field "${baselineField.declaringType.name}.${
                    baselineField.name
                }" should be decorated with ${expectedCollectDeclaration}${getRequiredBySuffix(
                    baselineField,
                )}.`,
                fieldToCheck.astNode,
            ),
        );
        return;
    }

    // wrong path
    if (
        fieldToCheck.collectPath &&
        baselineField.collectPath &&
        fieldToCheck.collectPath.path !== baselineField.collectPath.path
    ) {
        context.addMessage(
            ValidationMessage.compatibilityIssue(
                `Path should be "${baselineField.collectPath.path}"${getRequiredBySuffix(
                    baselineField,
                )}.`,
                fieldToCheck.collectPathAstNode ??
                    fieldToCheck.collectAstNode ??
                    fieldToCheck.astNode,
            ),
        );
        return;
    }

    // superfluous aggregate
    if (fieldToCheck.aggregationOperator && !baselineField.aggregationOperator) {
        context.addMessage(
            ValidationMessage.compatibilityIssue(
                `No aggregation should be used here${getRequiredBySuffix(baselineField)}.`,
                fieldToCheck.aggregationOperatorAstNode ?? fieldToCheck.astNode,
            ),
        );
    }

    // missing or wrong aggregate
    if (
        baselineField.aggregationOperator &&
        fieldToCheck.aggregationOperator !== baselineField.aggregationOperator
    ) {
        context.addMessage(
            ValidationMessage.compatibilityIssue(
                `Collect field should specify ${expectedAggregateDeclaration}${getRequiredBySuffix(
                    baselineField,
                )}.`,
                fieldToCheck.inverseOfAstNode ??
                    fieldToCheck.relationAstNode ??
                    fieldToCheck.astNode,
            ),
        );
    }
}

function checkDefaultValue(fieldToCheck: Field, baselineField: Field, context: ValidationContext) {
    // superfluous @defaultValue
    if (
        fieldToCheck.hasDefaultValue &&
        fieldToCheck.defaultValue !== null &&
        !baselineField.hasDefaultValue
    ) {
        context.addMessage(
            ValidationMessage.compatibilityIssue(
                `Field "${baselineField.declaringType.name}.${
                    baselineField.name
                }" should not have a default value${getRequiredBySuffix(baselineField)}.`,
                fieldToCheck.defaultValueAstNode ?? fieldToCheck.astNode,
            ),
        );
        return;
    }

    // no default value on either side
    if (!baselineField.hasDefaultValue || baselineField.defaultValue === null) {
        return;
    }

    const expectedDefaultValue = print(createValueNodeFromValue(baselineField.defaultValue));

    // missing @defaultValue
    if (!fieldToCheck.hasDefaultValue) {
        const expectedDeclaration = `@defaultValue(value: ${expectedDefaultValue})`;
        context.addMessage(
            ValidationMessage.compatibilityIssue(
                `Field "${baselineField.declaringType.name}.${
                    baselineField.name
                }" should be decorated with ${expectedDeclaration}${getRequiredBySuffix(
                    baselineField,
                )}.`,
                fieldToCheck.astNode,
            ),
        );
        return;
    }

    // wrong default value
    if (!isDeepStrictEqual(fieldToCheck.defaultValue, baselineField.defaultValue)) {
        context.addMessage(
            ValidationMessage.compatibilityIssue(
                `Default value should be ${expectedDefaultValue}${getRequiredBySuffix(
                    baselineField,
                )}.`,
                fieldToCheck.astNode,
            ),
        );
        return;
    }
}

/**
 * Checks whether all calc mutations defined in the baseline field are also present in the field to check
 */
function checkCalcMutations(fieldToCheck: Field, baselineField: Field, context: ValidationContext) {
    if (!baselineField.calcMutationOperators.size) {
        return;
    }

    const operators = [...baselineField.calcMutationOperators];

    // missing @calcMutations
    if (!fieldToCheck.calcMutationOperators.size) {
        const operatorsDesc = operators.map((o) => o.toString()).join(', ');
        const expectedDeclaration = `@calcMutations(operators: [${operatorsDesc}])`;
        context.addMessage(
            ValidationMessage.compatibilityIssue(
                `Field "${baselineField.declaringType.name}.${
                    baselineField.name
                }" should be decorated with ${expectedDeclaration}${getRequiredBySuffix(
                    baselineField,
                )}.`,
                fieldToCheck.astNode,
            ),
        );
        return;
    }

    // missing operators
    const missingOperators = operators.filter((o) => !fieldToCheck.calcMutationOperators.has(o));
    if (missingOperators.length) {
        let message;
        if (missingOperators.length === 1) {
            message = `Operator ${missingOperators[0]} is missing`;
        } else {
            message =
                'Operators ' +
                missingOperators.slice(0, missingOperators.length - 1).join(', ') +
                ' and ' +
                missingOperators[missingOperators.length - 1] +
                ' are missing';
        }

        const operatorsAstNode = fieldToCheck.calcMutationsAstNode?.arguments?.find(
            (a) => a.name.value === CALC_MUTATIONS_OPERATORS_ARG,
        );
        context.addMessage(
            ValidationMessage.compatibilityIssue(
                `${message}${getRequiredBySuffix(baselineField)}.`,
                operatorsAstNode ?? fieldToCheck.calcMutationsAstNode ?? fieldToCheck.astNode,
            ),
        );
        return;
    }
}
