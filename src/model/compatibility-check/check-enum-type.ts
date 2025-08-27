import { EnumType, EnumValue } from '../implementation';
import { MessageLocation, QuickFix, ValidationContext, ValidationMessage } from '../validation';
import { Change, ChangeSet, TextChange, YamlAddInMapChange } from '../change-set/change-set';
import { prettyPrint } from '../../graphql/pretty-print';
import { EnumValueNode, Kind } from 'graphql';
import { parseDocument } from 'yaml';
import { getYamlNodePairAtPathOrThrow, patchBeforeCommentFromParentMap } from './utils';

export function checkEnumType(
    typeToCheck: EnumType,
    baselineType: EnumType,
    context: ValidationContext,
) {
    for (const baselineValue of baselineType.values) {
        const matchingValue = typeToCheck.values.find((v) => v.value === baselineValue.value);
        if (!matchingValue) {
            const quickFixes: QuickFix[] = [];

            if (typeToCheck.astNode?.loc) {
                // -2 to skip closing bracket and newline character
                const offset = typeToCheck.astNode.loc.end - 2;
                const quickFixLocation = new MessageLocation(
                    MessageLocation.fromGraphQLLocation(typeToCheck.astNode.loc).source,
                    offset,
                    offset,
                );
                const enumValueNode: EnumValueNode = {
                    value: baselineValue.value,
                    kind: Kind.ENUM,
                };

                const fieldChanges: Change[] = [
                    new TextChange(
                        quickFixLocation,
                        '\n    ' + prettyPrint(enumValueNode).replaceAll('\n', ''),
                    ),
                ];

                const i18nChanges = generateYamlAddInMapChangesForEnumI18n(
                    baselineValue,
                    typeToCheck,
                );

                quickFixes.push(
                    new QuickFix({
                        description: 'Add missing enum value with i18n',
                        isPreferred: true,
                        changeSet: new ChangeSet([...fieldChanges, ...i18nChanges]),
                    }),
                );

                quickFixes.push(
                    new QuickFix({
                        description: 'Add missing enum value',
                        isPreferred: false,
                        changeSet: new ChangeSet([...fieldChanges]),
                    }),
                );
            }

            // No requiredBySuffix here because currently, it's not possible to assign individual
            // enum values to modules (the full enum is included in a module or it is not)
            context.addMessage(
                ValidationMessage.suppressableCompatibilityIssue(
                    'MISSING_ENUM_VALUE',
                    `Enum value "${baselineValue.value}" is missing.`,
                    typeToCheck.astNode,
                    { location: typeToCheck.nameASTNode, quickFixes },
                ),
            );
        }
    }
}

export function generateYamlAddInMapChangesForEnumI18n(
    baselineEnumValue: EnumValue,
    typeToCheck: EnumType,
): ReadonlyArray<YamlAddInMapChange> {
    const baselineValueLocalizations =
        baselineEnumValue.model.i18n.getEnumValueI18n(baselineEnumValue);
    const typeToCheckLocalizations = typeToCheck.model.i18n.getTypeI18n(typeToCheck);
    const result: YamlAddInMapChange[] = [];
    for (const [languageIsoCode, baselineEnumLocalization] of Object.entries(
        baselineValueLocalizations,
    )) {
        const typeToCheckLocalization = typeToCheckLocalizations[languageIsoCode];
        // if existing type localization is found, use the file. Otherwise, get the first localization
        // where the type is (partially) localized and add the translation there. Otherwise, use the source
        // name from the baseline
        const sourceName =
            typeToCheckLocalization?.loc?.sourceName ??
            Object.values(typeToCheckLocalizations)[0]?.loc?.sourceName ??
            baselineEnumLocalization.loc!.sourceName;
        const targetValuePath = [
            'i18n',
            languageIsoCode,
            'types',
            typeToCheck.name,
            'values',
            baselineEnumValue.value,
        ];
        const baselineLocalizationYamlDoc = parseDocument(
            baselineEnumLocalization.loc!.source.body,
        );
        // copy the yaml pair because we might modify its comments and pass it to the YamlAddInMapChange
        const enumLocalizationYamlPairCopy = getYamlNodePairAtPathOrThrow(
            baselineLocalizationYamlDoc,
            targetValuePath,
        ).clone();

        // small workaround - the commentBefore above the first pair of a map is attributed to the map
        // and not the scalar key.
        patchBeforeCommentFromParentMap(
            baselineLocalizationYamlDoc,
            enumLocalizationYamlPairCopy,
            targetValuePath,
        );

        result.push(
            new YamlAddInMapChange({
                sourceName,
                path: targetValuePath.slice(0, -1),
                value: enumLocalizationYamlPairCopy,
            }),
        );
    }
    return result;
}
