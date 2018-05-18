import { ASTValidator } from '../ast-validator';
import { DocumentNode } from 'graphql';
import { ValidationMessage } from '../../../model/validation';
import {
    findDirectiveWithName, getChildEntityTypes, getEntityExtensionTypes, getValueObjectTypes
} from '../../schema-utils';
import { INDEX_DIRECTIVE, UNIQUE_DIRECTIVE } from '../../schema-defaults';

export const VALIDATION_ERROR_INDICES_ONLY_ON_ROOT_ENTITIES = "Indices are only allowed in root entity fields. You can add indices to fields of embedded objects with @rootEntities(indices: [...]).";

export class IndicesValidator implements ASTValidator {

    validate(ast: DocumentNode): ValidationMessage[] {
        const validationMessages: ValidationMessage[] = [];
        [...getChildEntityTypes(ast), ...getEntityExtensionTypes(ast), ...getValueObjectTypes(ast)].forEach(nonRootEntityType => {
            nonRootEntityType.fields.forEach(field => {
                const index = findDirectiveWithName(field, INDEX_DIRECTIVE);
                const unique = findDirectiveWithName(field, UNIQUE_DIRECTIVE);
                if (index) {
                    validationMessages.push(ValidationMessage.error(VALIDATION_ERROR_INDICES_ONLY_ON_ROOT_ENTITIES, { type: nonRootEntityType.name.value, field: field.name.value }, index.loc));
                }
                if (unique) {
                    validationMessages.push(ValidationMessage.error(VALIDATION_ERROR_INDICES_ONLY_ON_ROOT_ENTITIES, { type: nonRootEntityType.name.value, field: field.name.value }, unique.loc));
                }
            })
        });
        return validationMessages;
    }

}
