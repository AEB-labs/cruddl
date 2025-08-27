import { FieldDefinitionNode } from 'graphql';
import { MODULES_DIRECTIVE } from '../../schema/constants';
import { Change, ChangeSet, TextChange, YamlAddInMapChange } from '../change-set/change-set';
import { Field, ObjectType, Type } from '../implementation';
import { MessageLocation, QuickFix, ValidationContext, ValidationMessage } from '../validation';
import { checkField } from './check-field';
import { checkRootEntityType } from './check-root-entity-type';
import { getRequiredBySuffix } from './describe-module-specification';
import { prettyPrint } from '../../graphql/pretty-print';
import { parseDocument } from 'yaml';
import {
    getYamlMapAtPath,
    getYamlNodePairAtPathOrThrow,
    patchBeforeCommentFromParentMap,
} from './utils';

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

                const fieldChanges: Change[] = [
                    new TextChange(quickFixLocation, '    ' + prettyPrint(cleanedAstNode) + '\n'),
                ];
                const i18nChanges = generateYamlAddInMapChangesForFieldI18n(
                    baselineField,
                    typeToCheck,
                );

                quickFixes.push(
                    new QuickFix({
                        description: `Add field "${baselineField.name} with i18n"`,
                        isPreferred: true,
                        changeSet: new ChangeSet([...fieldChanges, ...i18nChanges]),
                    }),
                );
                quickFixes.push(
                    new QuickFix({
                        description: `Add field "${baselineField.name}"`,
                        isPreferred: false,
                        changeSet: new ChangeSet(fieldChanges),
                    }),
                );
            }

            // cannot easily make this suppressable - if we would accept a @suppress on the type,
            // that would supress all missing fields, not just this one
            context.addMessage(
                ValidationMessage.nonSuppressableCompatibilityIssue(
                    `Field "${baselineType.name}.${
                        baselineField.name
                    }" is missing${getRequiredBySuffix(baselineField)}.`,
                    typeToCheck.nameASTNode ?? typeToCheck.astNode,
                    { quickFixes },
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

export function generateYamlAddInMapChangesForFieldI18n(
    baselineField: Field,
    typeToCheck: Type,
): ReadonlyArray<YamlAddInMapChange> {
    const baselineFieldLocalizations = baselineField.model.i18n.getFieldI18n(baselineField);
    const typeToCheckLocalizations = typeToCheck.model.i18n.getTypeI18n(typeToCheck);
    const result: YamlAddInMapChange[] = [];
    for (const [languageIsoCode, baselineFieldLocalization] of Object.entries(
        baselineFieldLocalizations,
    )) {
        const typeToCheckLocalization = typeToCheckLocalizations[languageIsoCode];
        // if existing type localization is found, use the file. Otherwise, get the first localization
        // where the type is (partially) localized and add the translation there. Otherwise, use the source
        // name from the baseline
        const sourceName =
            typeToCheckLocalization?.loc?.sourceName ??
            Object.values(typeToCheckLocalizations)[0]?.loc?.sourceName ??
            baselineFieldLocalization.loc!.sourceName;
        const targetFieldPath = [
            'i18n',
            languageIsoCode,
            'types',
            typeToCheck.name,
            'fields',
            baselineField.name,
        ];
        const baselineLocalizationYamlDoc = parseDocument(
            baselineFieldLocalization.loc!.source.body,
        );

        // copy the yaml pair because we might modify its comments and pass it to the YamlAddInMapChange
        const fieldLocalizationYamlPairCopy = getYamlNodePairAtPathOrThrow(
            baselineLocalizationYamlDoc,
            targetFieldPath,
        ).clone();

        // small workaround - the commentBefore above the first pair of a map is attributed to the map
        // and not the scalar key.
        patchBeforeCommentFromParentMap(
            baselineLocalizationYamlDoc,
            fieldLocalizationYamlPairCopy,
            targetFieldPath,
        );

        result.push(
            new YamlAddInMapChange({
                sourceName,
                path: targetFieldPath.slice(0, -1),
                value: fieldLocalizationYamlPairCopy,
            }),
        );
    }
    return result;
}
