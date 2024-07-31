import { DocumentNode, Kind } from 'graphql';
import { ValidationMessage } from '../../../model';
import { getObjectTypes } from '../../schema-utils';
import { ASTValidator } from '../ast-validator';

export const VALIDATION_ERROR_LISTS_OF_LISTS_NOT_ALLOWED = 'Lists of lists are not allowed.';

export class NoListsOfListsValidator implements ASTValidator {
    validate(ast: DocumentNode): ReadonlyArray<ValidationMessage> {
        const validationMessages: ValidationMessage[] = [];
        getObjectTypes(ast).forEach((ot) =>
            (ot.fields || []).forEach((field) => {
                let type = field.type;
                if (type.kind === Kind.NON_NULL_TYPE) {
                    type = type.type;
                }
                if (type.kind !== Kind.LIST_TYPE) {
                    return;
                }
                type = type.type;
                if (type.kind === Kind.NON_NULL_TYPE) {
                    type = type.type;
                }
                if (type.kind === Kind.LIST_TYPE) {
                    validationMessages.push(
                        ValidationMessage.error(
                            VALIDATION_ERROR_LISTS_OF_LISTS_NOT_ALLOWED,
                            field.type,
                        ),
                    );
                }
            }),
        );
        return validationMessages;
    }
}
