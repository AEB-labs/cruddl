import type { DocumentNode } from 'graphql';
import { ValidationMessage } from '../../../model/validation/message.js';
import { INDEX_DIRECTIVE, UNIQUE_DIRECTIVE } from '../../constants.js';
import {
    findDirectiveWithName,
    getChildEntityTypes,
    getEntityExtensionTypes,
    getValueObjectTypes,
} from '../../schema-utils.js';
import type { ASTValidator } from '../ast-validator.js';

export const VALIDATION_ERROR_INDICES_ONLY_ON_ROOT_ENTITIES =
    'Indices are only allowed in root entity fields. You can add indices to fields of embedded objects with @rootEntities(indices: [...]).';

export class IndicesValidator implements ASTValidator {
    validate(ast: DocumentNode): ReadonlyArray<ValidationMessage> {
        const validationMessages: ValidationMessage[] = [];
        [
            ...getChildEntityTypes(ast),
            ...getEntityExtensionTypes(ast),
            ...getValueObjectTypes(ast),
        ].forEach((nonRootEntityType) => {
            (nonRootEntityType.fields || []).forEach((field) => {
                const index = findDirectiveWithName(field, INDEX_DIRECTIVE);
                const unique = findDirectiveWithName(field, UNIQUE_DIRECTIVE);
                if (index) {
                    validationMessages.push(
                        ValidationMessage.error(
                            VALIDATION_ERROR_INDICES_ONLY_ON_ROOT_ENTITIES,
                            index,
                        ),
                    );
                }
                if (unique) {
                    validationMessages.push(
                        ValidationMessage.error(
                            VALIDATION_ERROR_INDICES_ONLY_ON_ROOT_ENTITIES,
                            unique,
                        ),
                    );
                }
            });
        });
        return validationMessages;
    }
}
