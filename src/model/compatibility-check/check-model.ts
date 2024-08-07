import { FieldDefinitionNode, print, TypeDefinitionNode } from 'graphql';
import { MODULES_DIRECTIVE } from '../../schema/constants';
import { ChangeSet, TextChange } from '../change-set/change-set';
import { Model } from '../implementation';
import {
    ValidationResult,
    ValidationMessage,
    ValidationContext,
    MessageLocation,
    QuickFix,
} from '../validation';
import { checkType } from './check-type';
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
            if (baselineType.astNode && modelToCheck.project) {
                const cleanedAstNode: TypeDefinitionNode = {
                    ...baselineType.astNode,
                    directives: (baselineType.astNode.directives ?? []).filter(
                        (d) => d.name.value !== MODULES_DIRECTIVE,
                    ),
                };
                const sourceName = baselineType.astNode.loc?.source.name ?? 'new.graphqls';
                const existingSource = modelToCheck.project.sources.find(s => s.name === sourceName);
                
                // end is the closing }, we want to add just before that
                // we will be inserting "  field: Type @directives\n" just before that closing }
                const offset = typeToCheck.astNode.loc.end - 1;
                const quickFixLocation = new MessageLocation(
                    MessageLocation.fromGraphQLLocation(typeToCheck.astNode.loc).source,
                    offset,
                    offset,
                );

                quickFixes.push(
                    new QuickFix({
                        description: `Add field "${baselineField.name}"`,
                        isPreferred: true,
                        changeSet: new ChangeSet([
                            new TextChange(quickFixLocation, '  ' + print(cleanedAstNode) + '\n'),
                        ]),
                    }),
                );
            }

            context.addMessage(
                ValidationMessage.compatibilityIssue(
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
