import type { Field } from '../implementation/field.js';
import type { VectorIndex } from '../implementation/vector-index.js';
import { ValidationMessage } from '../validation/message.js';
import type { ValidationContext } from '../validation/validation-context.js';

export function checkVectorIndex(
    fieldToCheck: Field,
    baselineField: Field,
    context: ValidationContext,
) {
    const baselineVectorIndex = baselineField.vectorIndex;
    if (!baselineVectorIndex) {
        return;
    }

    const existingVectorIndex = fieldToCheck.vectorIndex;

    if (!existingVectorIndex) {
        context.addMessage(
            ValidationMessage.suppressableCompatibilityIssue(
                'INDICES',
                `The vector index is missing: ${describeVectorIndex(baselineVectorIndex)} on field "${baselineField.name}"`,
                fieldToCheck.vectorIndex,
            ),
        );
        return;
    }

    if (
        serializeVectorIndexConfig(existingVectorIndex) !==
        serializeVectorIndexConfig(baselineVectorIndex)
    ) {
        context.addMessage(
            ValidationMessage.suppressableCompatibilityIssue(
                'INDICES',
                `The vector index has wrong parameters, should be: ${describeVectorIndex(baselineVectorIndex)} on field "${baselineField.name}"`,
                fieldToCheck.astNode,
                {
                    location: fieldToCheck.vectorIndex?.astNode ?? fieldToCheck.astNode,
                },
            ),
        );
    }
}

function serializeVectorIndexConfig(index: VectorIndex) {
    return JSON.stringify({
        sparse: index.sparse,
        metric: index.metric,
        dimension: index.dimension,
        nLists: index.nLists,
        defaultNProbe: index.defaultNProbe,
        maxNProbe: index.maxNProbe,
        trainingIterations: index.trainingIterations,
        factory: index.factory,
        storedValues: index.storedValues,
    });
}

function describeVectorIndex(index: VectorIndex): string {
    const args = [
        `metric: ${index.metric}`,
        `dimension: ${index.dimension}`,
        `nLists: ${index.nLists}`,
        `sparse: ${index.sparse}`,
        index.defaultNProbe != undefined ? `defaultNProbe: ${index.defaultNProbe}` : undefined,
        index.maxNProbe != undefined ? `maxNProbe: ${index.maxNProbe}` : undefined,
        index.trainingIterations != undefined
            ? `trainingIterations: ${index.trainingIterations}`
            : undefined,
        index.factory != undefined ? `factory: "${index.factory}"` : undefined,
        index.storedValues.length
            ? `storedValues: [${index.storedValues.map((v) => `"${v}"`).join(', ')}]`
            : undefined,
    ].filter((a) => !!a);

    return `@vectorIndex(${args.join(', ')})`;
}
