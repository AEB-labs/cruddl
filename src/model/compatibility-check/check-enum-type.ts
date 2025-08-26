import { EnumValueNode, Kind } from 'graphql';
import { parseDocument } from 'yaml';
import { prettyPrint } from '../../graphql/pretty-print';
import { Change, ChangeSet, TextChange, YamlAddInMapChange } from '../change-set/change-set';
import { EnumType, EnumValue, ModelI18n } from '../implementation';
import { MessageLocation, QuickFix, ValidationContext, ValidationMessage } from '../validation';
import {
    getTypeLocalizationConfigs,
    getYamlNodePairAtPath,
    patchBeforeCommentFromParentMap,
} from './utils';

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

                const i18nChanges = generateYamlAddInMapChangesForEnumValueI18n({
                    baselineEnumValue: baselineValue,
                    enumTypeName: typeToCheck.name,
                    toCheckModelI18n: typeToCheck.model.i18n,
                });

                if (i18nChanges.length) {
                    quickFixes.push(
                        new QuickFix({
                            description: 'Add missing enum value with i18n',
                            isPreferred: true,
                            changeSet: new ChangeSet([...fieldChanges, ...i18nChanges]),
                        }),
                    );
                }

                quickFixes.push(
                    new QuickFix({
                        description: 'Add missing enum value',
                        isPreferred: !i18nChanges.length,
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

export function generateYamlAddInMapChangesForEnumValueI18n(args: {
    baselineEnumValue: EnumValue;
    enumTypeName: string;
    toCheckModelI18n: ModelI18n;
}): ReadonlyArray<YamlAddInMapChange> {
    const { baselineEnumValue, enumTypeName, toCheckModelI18n } = args;
    const baselineTypeConfigs = getTypeLocalizationConfigs(
        baselineEnumValue.model.i18n.configs,
        enumTypeName,
    );
    const toCheckTypeConfigs = getTypeLocalizationConfigs(toCheckModelI18n.configs, enumTypeName);
    const result: YamlAddInMapChange[] = [];

    for (const [language, baselineTypeConfig] of Object.entries(baselineTypeConfigs)) {
        if (!baselineTypeConfig) {
            continue;
        }
        const toCheckTypeConfig = toCheckTypeConfigs[language];
        if (toCheckTypeConfig?.values?.[baselineEnumValue.value]) {
            continue;
        }

        const sourceName =
            toCheckTypeConfig?.loc?.sourceName ??
            Object.values(toCheckTypeConfigs)[0]?.loc?.sourceName ??
            baselineTypeConfig.loc!.sourceName;
        const path = ['i18n', language, 'types', enumTypeName, 'values', baselineEnumValue.value];
        const doc = parseDocument(baselineTypeConfig.loc!.source.body);

        const value = getYamlNodePairAtPath(doc, path);

        if (!value) {
            continue;
        }

        const patchedValue = patchBeforeCommentFromParentMap(doc, value, path);

        result.push(
            new YamlAddInMapChange({
                sourceName,
                path: path.slice(0, -1),
                value: patchedValue,
            }),
        );
    }
    return result;
}
