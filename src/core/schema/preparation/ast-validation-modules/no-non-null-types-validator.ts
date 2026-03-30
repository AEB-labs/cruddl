import type { DocumentNode, TypeNode } from 'graphql';
import { Kind } from 'graphql';
import { ValidationMessage } from '../../../model/validation/message.js';
import { getObjectTypes } from '../../schema-utils.js';
import type { ASTValidator } from '../ast-validator.js';

function findOutermostNonNullNode(
    type: TypeNode,
): Extract<TypeNode, { kind: 'NonNullType' }> | undefined {
    if (type.kind === Kind.NON_NULL_TYPE) {
        return type;
    }
    if (type.kind === Kind.LIST_TYPE) {
        return findOutermostNonNullNode(type.type);
    }
    return undefined;
}

export class NoNonNullTypesValidator implements ASTValidator {
    validate(ast: DocumentNode): ReadonlyArray<ValidationMessage> {
        const validationMessages: ValidationMessage[] = [];
        getObjectTypes(ast).forEach((ot) => {
            (ot.fields ?? []).forEach((field) => {
                const nonNullNode = findOutermostNonNullNode(field.type);
                if (nonNullNode) {
                    validationMessages.push(
                        ValidationMessage.nonSuppressableWarning(
                            'Non-null types (!) have no effect and should be removed.',
                            nonNullNode,
                        ),
                    );
                }
            });
        });
        return validationMessages;
    }
}
