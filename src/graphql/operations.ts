import { DocumentNode, OperationDefinitionNode } from 'graphql';

export function extractOperation(document: DocumentNode, operationName: string|undefined|null) {
    let ops = document.definitions.filter(doc => doc.kind == 'OperationDefinition') as OperationDefinitionNode[];
    if (!ops.length) {
        throw new Error(`The document does not define any operations`);
    }
    if (operationName) {
        ops = ops.filter(op => op.name && op.name.value == operationName);
        if (!ops.length) {
            throw new Error(`Operation ${JSON.stringify(operationName)} not found`);
        }
        if (ops.length > 1) {
            throw new Error(`There are multiple operations called ${JSON.stringify(operationName)}`);
        }
    } else {
        if (ops.length > 1) {
            throw new Error(`The document defines multiple operations`);
        }
    }
    return ops[0];
}
