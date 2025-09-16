import { FieldDefinitionNode } from 'graphql';
import { prettyPrint } from '../../graphql/pretty-print';
import { MODULES_DIRECTIVE } from '../../schema/constants';
import { Change, ChangeSet, TextChange, YamlAddInMapChange } from '../change-set/change-set';
import { ModelI18n, ObjectType } from '../implementation';
import { MessageLocation, QuickFix, ValidationContext, ValidationMessage } from '../validation';
import { checkField } from './check-field';
import { checkRootEntityType } from './check-root-entity-type';
import { getRequiredBySuffix } from './describe-module-specification';
import {
    getYamlNodePairAtPathOrThrow,
    patchBeforeCommentFromParentMap,
    safeParseDocument,
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
                const i18nChanges = generateYamlAddInMapChangesForFieldI18n({
                    fieldName: baselineField.name,
                    typeName: typeToCheck.name,
                    toCheckModelI18n: typeToCheck.model.i18n,
                    baselineModelI18n: baselineField.model.i18n,
                });

                if (i18nChanges.length) {
                    quickFixes.push(
                        new QuickFix({
                            description: `Add field "${baselineField.name} with i18n"`,
                            isPreferred: true,
                            changeSet: new ChangeSet([...fieldChanges, ...i18nChanges]),
                        }),
                    );
                }
                quickFixes.push(
                    new QuickFix({
                        description: `Add field "${baselineField.name}"`,
                        isPreferred: !i18nChanges.length,
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

export function generateYamlAddInMapChangesForFieldI18n(args: {
    fieldName: string;
    baselineModelI18n: ModelI18n;
    typeName: string;
    toCheckModelI18n: ModelI18n;
}): ReadonlyArray<YamlAddInMapChange> {
    const { fieldName, baselineModelI18n, toCheckModelI18n, typeName } = args;
    const baselineFieldConfigs = baselineModelI18n.getFieldLocalizationConfigs(typeName, fieldName);
    const baselineGlobalFieldConfigs =
        baselineModelI18n.getGlobalFieldLocalizationConfigs(fieldName);

    const toCheckFieldConfigs = toCheckModelI18n.getFieldLocalizationConfigs(typeName, fieldName);

    const toCheckTypeConfigs = toCheckModelI18n.getTypeLocalizationConfigs(typeName);

    const toCheckGlobalFieldConfigs = toCheckModelI18n.getGlobalFieldLocalizationConfigs(fieldName);

    const availableLanguages = [
        ...Object.keys(baselineFieldConfigs),
        ...Object.keys(baselineGlobalFieldConfigs),
    ];

    const globalFieldConfigs = toCheckModelI18n.getFirstMatchingGlobalFieldConfigs();

    const result: YamlAddInMapChange[] = [];
    for (const language of availableLanguages) {
        const baselineFieldConfig = baselineFieldConfigs[language];
        const baselineGlobalFieldConfig = baselineGlobalFieldConfigs[language];
        const toCheckFieldConfig = toCheckFieldConfigs[language];
        const toCheckTypeConfig = toCheckTypeConfigs[language];
        const toCheckGlobalFieldConfig = toCheckGlobalFieldConfigs[language];
        const globalFieldConfig = globalFieldConfigs[language];

        let targetSourceName: string | null = null;
        let targetDocString: string | null = null;
        let targetPath: ReadonlyArray<unknown> | null = null;

        // Baseline field config present, field not present in checked project => add it
        if (baselineFieldConfig && !toCheckFieldConfig) {
            // Either take existing i18n for type in language, or group field in file with
            // type translations in other language, or as fallback, use the filename from the baseline
            targetSourceName =
                toCheckTypeConfig?.loc?.sourceName ??
                Object.values(toCheckTypeConfigs)[0]?.loc?.sourceName ??
                baselineFieldConfig.loc!.sourceName;
            targetPath = ['i18n', language, 'types', typeName, 'fields', fieldName];
            targetDocString = baselineFieldConfig.loc!.source.body;
        }
        // global field config present, no global field or type dependent field config present in checked project => add it
        else if (baselineGlobalFieldConfig && !toCheckGlobalFieldConfig && !toCheckFieldConfig) {
            targetSourceName =
                globalFieldConfig?.loc?.sourceName ?? baselineGlobalFieldConfig.loc!.sourceName;
            targetPath = ['i18n', language, 'fields', fieldName];
            targetDocString = baselineGlobalFieldConfig.loc!.source.body;
        }

        if (targetSourceName && targetDocString && targetPath) {
            const targetDoc = safeParseDocument(targetDocString);

            // if we find parsing errors in the document skip this translation
            // we can assume that the baseline projects i18n files should be without
            // errors, otherwise do not try to perform more error handling
            if (!targetDoc) {
                continue;
            }

            // copy the yaml pair because we might modify its comments and pass it to the YamlAddInMapChange
            const targetValue = getYamlNodePairAtPathOrThrow(targetDoc, targetPath).clone();

            // small workaround - the commentBefore above the first pair of a map is attributed to the map
            // and not the scalar key.
            patchBeforeCommentFromParentMap(targetDoc, targetValue, targetPath);

            result.push(
                new YamlAddInMapChange({
                    sourceName: targetSourceName,
                    path: targetPath.slice(0, -1),
                    value: targetValue,
                }),
            );
        }
    }
    return result;
}
