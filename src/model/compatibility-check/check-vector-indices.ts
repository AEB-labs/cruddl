import { INDICES_ARG } from '../../schema/constants';
import { VectorIndexDefinitionConfig } from '../config';
import { RootEntityType } from '../implementation/root-entity-type';
import { ValidationContext, ValidationMessage } from '../validation';

export function checkVectorIndices(
    typeToCheck: RootEntityType,
    baselineType: RootEntityType,
    context: ValidationContext,
) {
    const existingVectorIndices = new Set(
        typeToCheck.vectorIndexConfigs.map((config) => serializeVectorIndexConfig(config)),
    );
    const missingVectorIndexConfigs = baselineType.vectorIndexConfigs.filter(
        (baselineIndex) => !existingVectorIndices.has(serializeVectorIndexConfig(baselineIndex)),
    );

    if (!missingVectorIndexConfigs.length) {
        return;
    }

    const missingVectorIndicesDesc = missingVectorIndexConfigs
        .map((c) => describeVectorIndexConfig(c))
        .join(', ');

    const location =
        typeToCheck.kindAstNode?.arguments?.find((a) => a.name.value === INDICES_ARG)?.value ??
        typeToCheck.kindAstNode;
    const indexIsOrPlural = missingVectorIndexConfigs.length > 1 ? 'indices are' : 'index is';
    context.addMessage(
        ValidationMessage.suppressableCompatibilityIssue(
            'INDICES',
            `The following ${indexIsOrPlural} missing: ${missingVectorIndicesDesc}`,
            typeToCheck.astNode,
            { location },
        ),
    );
}

function serializeVectorIndexConfig(indexConfig: VectorIndexDefinitionConfig) {
    return JSON.stringify({
        field: indexConfig.field,
        sparse: indexConfig.sparse ?? true,
        metric: indexConfig.metric,
        dimension: indexConfig.dimension,
        nLists: indexConfig.nLists,
        defaultNProbe: indexConfig.defaultNProbe,
        trainingIterations: indexConfig.trainingIterations,
        factory: indexConfig.factory,
        storedValues: indexConfig.storedValues ?? [],
    });
}

function describeVectorIndexConfig(indexConfig: VectorIndexDefinitionConfig): string {
    const args = [
        `metric: ${indexConfig.metric}`,
        `dimension: ${indexConfig.dimension}`,
        `nLists: ${indexConfig.nLists}`,
        `sparse: ${indexConfig.sparse ?? true}`,
        indexConfig.defaultNProbe != undefined
            ? `defaultNProbe: ${indexConfig.defaultNProbe}`
            : undefined,
        indexConfig.trainingIterations != undefined
            ? `trainingIterations: ${indexConfig.trainingIterations}`
            : undefined,
        indexConfig.factory != undefined ? `factory: \"${indexConfig.factory}\"` : undefined,
        indexConfig.storedValues?.length
            ? `storedValues: [${indexConfig.storedValues.map((v) => `\"${v}\"`).join(', ')}]`
            : undefined,
    ].filter((a) => !!a);

    return `@vectorIndex(${args.join(', ')}) on field \"${indexConfig.field}\"`;
}
