import { ASTValidator } from '../ast-validator';
import { DocumentNode } from 'graphql';
import { ValidationMessage } from '../../../model/validation';
import { getObjectTypes } from '../../schema-utils';

export const VALIDATION_ERROR_NON_UNIQUE_FIELDS = "A field with the same name already exists in this type.";

export class NonUniqueFieldsValidator implements ASTValidator {

    validate(ast: DocumentNode): ValidationMessage[] {
        const validationMessages: ValidationMessage[] = [];
        getObjectTypes(ast).forEach(objectTypeDefinition => {
            objectTypeDefinition.fields.forEach(field => {
                if(objectTypeDefinition.fields.find((comparisonField) => comparisonField !== field && comparisonField.name.value === field.name.value)) {
                    validationMessages.push(ValidationMessage.error(VALIDATION_ERROR_NON_UNIQUE_FIELDS, {type: objectTypeDefinition.name.value}, field.loc));
                }
            });
        });
        return validationMessages;
    }
}
