import { ASTValidator } from '../ast-validator';
import { DocumentNode } from 'graphql';
import { ValidationMessage } from '../../../model';
import { getObjectTypes } from '../../schema-utils';
import { KEY_FIELD_DIRECTIVE, ROOT_ENTITY_DIRECTIVE } from '../../constants';

export const VALIDATION_ERROR_INVALID_OBJECT_TYPE = "A @key field can only be declared on root entities.";

export class KeyFieldValidator implements ASTValidator {

    validate(ast: DocumentNode): ValidationMessage[] {
        const validationMessages: ValidationMessage[] = [];
        getObjectTypes(ast).forEach(objectTypeDefinition => {
            let counter = 0;
            const keyFields = (objectTypeDefinition.fields || []).filter(field => field.directives != undefined && field.directives.some(directive => directive.name.value === KEY_FIELD_DIRECTIVE)).forEach(keyField => {
                counter++;
                if (objectTypeDefinition.directives != undefined && !objectTypeDefinition.directives.some(directive => directive.name.value === ROOT_ENTITY_DIRECTIVE)) {
                    validationMessages.push(ValidationMessage.error(VALIDATION_ERROR_INVALID_OBJECT_TYPE, {type: objectTypeDefinition.name.value}, keyField.loc));
                }
            })
        });
        return validationMessages;
    }
}
