import { Kind, TypeDefinitionNode } from 'graphql';
import { MODULES_DIRECTIVE } from '../../schema/constants';
import { AppendChange, ChangeSet } from '../change-set/change-set';
import { Model } from '../implementation';
import { QuickFix, ValidationContext, ValidationMessage, ValidationResult } from '../validation';
import { checkType } from './check-type';
import { prettyPrint } from '../../graphql/pretty-print';
import { getRequiredBySuffix } from './describe-module-specification';

/**
 * Checks whether a model (modelToCheck) can be used in a place where another model (baselineModel) is expected.
 */
export function checkModel(modelToCheck: Model, baselineModel: Model): ValidationResult {
    const context = new ValidationContext();

    for (const baselineType of baselineModel.types) {
        const matchingType = modelToCheck.getType(baselineType.name);
        if (!matchingType) {
            const quickFixes: QuickFix[] = [];
            if (baselineType.astNode) {
                let cleanedAstNode: TypeDefinitionNode = {
                    ...baselineType.astNode,
                    directives: (baselineType.astNode.directives ?? []).filter(
                        (d) => d.name.value !== MODULES_DIRECTIVE,
                    ),
                };
                if (
                    baselineType.astNode.kind === Kind.OBJECT_TYPE_DEFINITION &&
                    cleanedAstNode.kind === Kind.OBJECT_TYPE_DEFINITION
                ) {
                    cleanedAstNode = {
                        ...cleanedAstNode,
                        fields: baselineType.astNode.fields?.map((fieldDef) => ({
                            ...fieldDef,
                            directives: (fieldDef.directives ?? []).filter(
                                (d) => d.name.value !== MODULES_DIRECTIVE,
                            ),
                        })),
                    };
                }
                const sourceName = baselineType.astNode.loc?.source.name ?? 'new.graphqls';

                quickFixes.push(
                    new QuickFix({
                        description: `Add type "${baselineType.name}"`,
                        isPreferred: true,
                        changeSet: new ChangeSet([
                            new AppendChange(sourceName, prettyPrint(cleanedAstNode) + '\n'),
                        ]),
                    }),
                );
            }

            context.addMessage(
                ValidationMessage.nonSuppressableCompatibilityIssue(
                    `Type "${baselineType.name}" is missing${getRequiredBySuffix(baselineType)}.`,
                    undefined,
                    { quickFixes },
                ),
            );
            continue;
        }

        checkType(matchingType, baselineType, context);
    }

    return context.asResult();
}
