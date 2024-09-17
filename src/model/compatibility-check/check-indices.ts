import { RootEntityType } from '../implementation';
import { ValidationContext, ValidationMessage } from '../validation';
import { IndexDefinitionConfig } from '../config';
import { Kind, ObjectFieldNode, ObjectValueNode, print, StringValueNode } from 'graphql';
import { INDICES_ARG } from '../../schema/constants';

export function checkIndices(
    typeToCheck: RootEntityType,
    baselineType: RootEntityType,
    context: ValidationContext,
) {
    // use index config instead of indices because there is a transformation step that changes
    // indices and also adds new indices. It would be confusing report issues for these.
    const existing = new Set(
        typeToCheck.indexConfigs.map((config) => serializeIndexConfig(config)),
    );
    const missingIndexConfigs = baselineType.indexConfigs.filter(
        (baselineIndex) => !existing.has(serializeIndexConfig(baselineIndex)),
    );

    if (!missingIndexConfigs.length) {
        return;
    }

    const missingIndicesDesc = missingIndexConfigs
        .map((c) => print(createIndexAstNode(c)))
        .join(', ');

    const location =
        typeToCheck.kindAstNode?.arguments?.find((a) => a.name.value === INDICES_ARG)?.value ??
        typeToCheck.kindAstNode;
    const indexIsOrPlural = missingIndexConfigs.length > 1 ? 'indices are' : 'index is';
    context.addMessage(
        ValidationMessage.suppressableCompatibilityIssue(
            'INDICES',
            `The following ${indexIsOrPlural} missing: ${missingIndicesDesc}`,
            typeToCheck.astNode,
            { location },
        ),
    );
}

function serializeIndexConfig(indexConfig: IndexDefinitionConfig) {
    const unique = indexConfig.unique ?? false;
    const sparse = indexConfig.sparse ?? unique;
    return JSON.stringify({
        fields: indexConfig.fields,
        sparse,
        unique,
    });
}

function createIndexAstNode(indexConfig: IndexDefinitionConfig): ObjectValueNode {
    const unique = indexConfig.unique ?? false;
    const sparse = indexConfig.sparse ?? unique;

    const fields: ObjectFieldNode[] = [
        {
            kind: Kind.OBJECT_FIELD,
            name: { kind: Kind.NAME, value: 'fields' },
            value: {
                kind: Kind.LIST,
                values: indexConfig.fields.map(
                    (value): StringValueNode => ({ kind: Kind.STRING, value }),
                ),
            },
        },
    ];

    if (unique) {
        fields.push({
            kind: Kind.OBJECT_FIELD,
            name: { kind: Kind.NAME, value: 'unique' },
            value: { kind: Kind.BOOLEAN, value: true },
        });
    }

    // sparse defaults to unique
    if (sparse !== unique) {
        fields.push({
            kind: Kind.OBJECT_FIELD,
            name: { kind: Kind.NAME, value: 'sparse' },
            value: { kind: Kind.BOOLEAN, value: sparse },
        });
    }

    return {
        kind: Kind.OBJECT,
        fields,
    };
}
