import { DocumentNode } from 'graphql';
import { ValidationMessage } from '../../../model';
import { VECTOR_INDEX_DIRECTIVE } from '../../constants';
import {
    findDirectiveWithName,
    getChildEntityTypes,
    getEntityExtensionTypes,
    getValueObjectTypes,
} from '../../schema-utils';
import { ASTValidator } from '../ast-validator';

export const VALIDATION_ERROR_VECTOR_INDICES_ONLY_ON_ROOT_ENTITIES =
    '@vectorIndex is only allowed in root entity fields.';

export class VectorIndicesValidator implements ASTValidator {
    validate(ast: DocumentNode): ReadonlyArray<ValidationMessage> {
        const validationMessages: ValidationMessage[] = [];
        [
            ...getChildEntityTypes(ast),
            ...getEntityExtensionTypes(ast),
            ...getValueObjectTypes(ast),
        ].forEach((nonRootEntityType) => {
            (nonRootEntityType.fields || []).forEach((field) => {
                const vectorIndex = findDirectiveWithName(field, VECTOR_INDEX_DIRECTIVE);
                if (vectorIndex) {
                    validationMessages.push(
                        ValidationMessage.error(
                            VALIDATION_ERROR_VECTOR_INDICES_ONLY_ON_ROOT_ENTITIES,
                            vectorIndex,
                        ),
                    );
                }
            });
        });
        return validationMessages;
    }
}
