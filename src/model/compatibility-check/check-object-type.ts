import { FieldDefinitionNode, print } from 'graphql';
import { MODULES_DIRECTIVE } from '../../schema/constants';
import { ChangeSet, TextChange } from '../change-set/change-set';
import { ObjectType } from '../implementation';
import { MessageLocation, QuickFix, ValidationContext, ValidationMessage } from '../validation';
import { checkField } from './check-field';
import { checkRootEntityType } from './check-root-entity-type';
import { getRequiredBySuffix } from './describe-module-specification';
import { prettyPrint } from '../../graphql/pretty-print';

export function checkObjectType(
    typeToCheck: ObjectType,
    baselineType: ObjectType,
    context: ValidationContext,
) {
    for (const baselineField of baselineType.fields) {
        const matchingField = typeToCheck.getField(baselineField.name);

        if (!matchingField) {
            const quickFixes: QuickFix[] = [];
            if (typeToCheck.astNode?.loc && baselineField.astNode) {
                const cleanedAstNode: FieldDefinitionNode = {
                    ...baselineField.astNode,
                    directives: (baselineField.astNode.directives ?? []).filter(
                        (d) => d.name.value !== MODULES_DIRECTIVE,
                    ),
                };
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
                            new TextChange(
                                quickFixLocation,
                                '    ' + prettyPrint(cleanedAstNode) + '\n',
                            ),
                        ]),
                    }),
                );
            }

            context.addMessage(
                ValidationMessage.suppressableCompatibilityIssue(
                    'MISSING_FIELD',
                    `Field "${baselineType.name}.${
                        baselineField.name
                    }" is missing${getRequiredBySuffix(baselineField)}.`,
                    typeToCheck.astNode,
                    { location: typeToCheck.nameASTNode, quickFixes },
                ),
            );
            continue;
        }

        checkField(matchingField, baselineField, context);
    }

    if (baselineType.isRootEntityType && typeToCheck.isRootEntityType) {
        checkRootEntityType(typeToCheck, baselineType, context);
    }
}
