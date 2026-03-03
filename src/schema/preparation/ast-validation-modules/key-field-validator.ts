import type { DocumentNode } from 'graphql';
import { ValidationMessage } from '../../../model/index.js';
import { isDefined } from '../../../utils/utils.js';
import { KEY_FIELD_DIRECTIVE, ROOT_ENTITY_DIRECTIVE } from '../../constants.js';
import { getObjectTypes } from '../../schema-utils.js';
import type { ASTValidator } from '../ast-validator.js';

export const VALIDATION_ERROR_INVALID_OBJECT_TYPE =
    'A @key field can only be declared on root entities.';

export class KeyFieldValidator implements ASTValidator {
    validate(ast: DocumentNode): ReadonlyArray<ValidationMessage> {
        const validationMessages: ValidationMessage[] = [];
        getObjectTypes(ast).forEach((objectTypeDefinition) => {
            let counter = 0;
            const keyFields = (objectTypeDefinition.fields || [])
                .filter(
                    (field) =>
                        isDefined(field.directives) &&
                        field.directives.some(
                            (directive) => directive.name.value === KEY_FIELD_DIRECTIVE,
                        ),
                )
                .forEach((keyField) => {
                    counter++;
                    if (
                        isDefined(objectTypeDefinition.directives) &&
                        !objectTypeDefinition.directives.some(
                            (directive) => directive.name.value === ROOT_ENTITY_DIRECTIVE,
                        )
                    ) {
                        validationMessages.push(
                            ValidationMessage.error(VALIDATION_ERROR_INVALID_OBJECT_TYPE, keyField),
                        );
                    }
                });
        });
        return validationMessages;
    }
}
