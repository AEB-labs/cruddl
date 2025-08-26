import { Kind, TypeDefinitionNode } from 'graphql';
import { prettyPrint } from '../../graphql/pretty-print';
import { MODULES_DIRECTIVE } from '../../schema/constants';
import { AppendChange, ChangeSet, YamlAddInMapChange } from '../change-set/change-set';
import { TypeKind } from '../config';
import { Model, ModelI18n, Type } from '../implementation';
import { QuickFix, ValidationContext, ValidationMessage, ValidationResult } from '../validation';
import { generateYamlAddInMapChangesForEnumValueI18n } from './check-enum-type';
import { generateYamlAddInMapChangesForFieldI18n } from './check-object-type';
import { checkType } from './check-type';
import { getRequiredBySuffix } from './describe-module-specification';
import {
    getTypeLocalizationConfigs,
    getYamlNodePairAtPath,
    patchBeforeCommentFromParentMap,
    safeParseDocument,
} from './utils';

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

                const i18nChanges = generateYamlAddInMapChangesForTypeI18n({
                    baselineType,
                    toCheckModelI18n: modelToCheck.i18n,
                });

                if (i18nChanges.length) {
                    quickFixes.push(
                        new QuickFix({
                            description: `Add type "${baselineType.name}" with i18n`,
                            isPreferred: true,
                            changeSet: new ChangeSet([...typeChanges, ...i18nChanges]),
                        }),
                    );
                }

                quickFixes.push(
                    new QuickFix({
                        description: `Add type "${baselineType.name}"`,
                        isPreferred: !i18nChanges.length,
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

export function generateYamlAddInMapChangesForTypeI18n(args: {
    toCheckModelI18n: ModelI18n;
    baselineType: Type;
}): ReadonlyArray<YamlAddInMapChange> {
    const { toCheckModelI18n, baselineType } = args;

    if (baselineType.kind === TypeKind.SCALAR) {
        return [];
    }

    const result: Array<YamlAddInMapChange> = [];

    const baselineTypeConfigs = getTypeLocalizationConfigs(
        baselineType.model.i18n.configs,
        baselineType.name,
    );
    const toCheckTypeConfigs = getTypeLocalizationConfigs(
        toCheckModelI18n.configs,
        baselineType.name,
    );

    // add type i18n
    for (const [language, baselineTypeConfig] of Object.entries(baselineTypeConfigs)) {
        if (!baselineTypeConfig) {
            continue;
        }

        const toCheckTypeConfig = toCheckTypeConfigs[language];

        const doc = safeParseDocument(baselineTypeConfig.loc!.source.body);

        if (!doc) {
            continue;
        }

        const basePath = ['i18n', language, 'types', baselineType.name];
        const keysToCheck = ['label', 'labelPlural', 'hint'];
        const sourceName =
            toCheckTypeConfig?.loc?.sourceName ??
            Object.values(toCheckTypeConfigs)[0]?.loc?.sourceName ??
            baselineTypeConfig.loc!.sourceName;

        for (const key of keysToCheck) {
            const path = [...basePath, key];
            const value = getYamlNodePairAtPath(doc, path);
            if (value) {
                const patchedValue = patchBeforeCommentFromParentMap(doc, value, path);
                result.push(
                    new YamlAddInMapChange({
                        sourceName,
                        path: path.slice(0, -1),
                        value: patchedValue,
                    }),
                );
            }
        }
    }

    // handle fields of object type
    if (baselineType.isObjectType) {
        for (const field of baselineType.fields) {
            result.push(
                ...generateYamlAddInMapChangesForFieldI18n({
                    fieldName: field.name,
                    typeName: baselineType.name,
                    baselineModelI18n: baselineType.model.i18n,
                    toCheckModelI18n,
                }),
            );
        }
    }

    // handle values of enum type
    if (baselineType.isEnumType) {
        result.push(
            ...baselineType.values.flatMap((value) =>
                generateYamlAddInMapChangesForEnumValueI18n({
                    baselineEnumValue: value,
                    enumTypeName: baselineType.name,
                    toCheckModelI18n,
                }),
            ),
        );
    }

    return result;
}
