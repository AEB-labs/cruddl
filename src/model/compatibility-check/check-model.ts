import { Kind, TypeDefinitionNode } from 'graphql';
import { MODULES_DIRECTIVE } from '../../schema/constants';
import { AppendChange, ChangeSet, YamlAddInMapChange } from '../change-set/change-set';
import { Model, Type } from '../implementation';
import { QuickFix, ValidationContext, ValidationMessage, ValidationResult } from '../validation';
import { checkType } from './check-type';
import { prettyPrint } from '../../graphql/pretty-print';
import { getRequiredBySuffix } from './describe-module-specification';
import { parseDocument } from 'yaml';
import { getYamlNodePairAtPathOrThrow, patchBeforeCommentFromParentMap } from './utils';

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

                const typeChanges: AppendChange[] = [
                    new AppendChange(sourceName, prettyPrint(cleanedAstNode) + '\n'),
                ];
                const i18nChanges = generateYamlAddInMapChangesForTypeI18n(baselineType);

                quickFixes.push(
                    new QuickFix({
                        description: `Add type "${baselineType.name}" with i18n`,
                        isPreferred: true,
                        changeSet: new ChangeSet([...typeChanges, ...i18nChanges]),
                    }),
                );

                quickFixes.push(
                    new QuickFix({
                        description: `Add type "${baselineType.name}"`,
                        isPreferred: false,
                        changeSet: new ChangeSet([...typeChanges]),
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

export function generateYamlAddInMapChangesForTypeI18n(
    baselineType: Type,
): ReadonlyArray<YamlAddInMapChange> {
    const baselineTypeLocalizations = baselineType.model.i18n.getTypeI18n(baselineType);
    const result: YamlAddInMapChange[] = [];
    for (const [languageIsoCode, baselineTypeLocalization] of Object.entries(
        baselineTypeLocalizations,
    )) {
        // we cannot check for existing translations here because we do not even have type => take
        // the baseline type translation path in any case. Should projects already have translations
        // for non-existing types they will be shown as a warning anyway.
        const sourceName = baselineTypeLocalization.loc!.sourceName;
        const targetTypePath = ['i18n', languageIsoCode, 'types', baselineType.name];
        const baselineLocalizationYamlDoc = parseDocument(
            baselineTypeLocalization.loc!.source.body,
        );

        // copy the yaml pair because we might modify its comments and pass it to the YamlAddInMapChange
        const typeLocalizationYamlPairCopy = getYamlNodePairAtPathOrThrow(
            baselineLocalizationYamlDoc,
            targetTypePath,
        ).clone();

        // small workaround - the commentBefore above the first pair of a map is attributed to the map
        // and not the scalar key.
        patchBeforeCommentFromParentMap(
            baselineLocalizationYamlDoc,
            typeLocalizationYamlPairCopy,
            targetTypePath,
        );

        result.push(
            new YamlAddInMapChange({
                sourceName,
                path: targetTypePath.slice(0, -1),
                value: typeLocalizationYamlPairCopy,
            }),
        );
    }
    return result;
}
