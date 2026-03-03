import { DocumentNode } from 'graphql';
import { ValidationMessage } from '../../../model';
import { ROLES_DIRECTIVE, ROOT_ENTITY_DIRECTIVE } from '../../constants';
import { findDirectiveWithName, getObjectTypes } from '../../schema-utils';
import { ASTValidator } from '../ast-validator';

export const VALIDATION_ERROR_ROLES_ON_NON_ROOT_ENTITY_TYPE =
    '@roles is only allowed on fields and on root entity types.';

export class RolesOnNonRootEntityTypesValidator implements ASTValidator {
    validate(ast: DocumentNode): ReadonlyArray<ValidationMessage> {
        const validationMessages: ValidationMessage[] = [];
        getObjectTypes(ast)
            .filter((obj) => !findDirectiveWithName(obj, ROOT_ENTITY_DIRECTIVE))
            .forEach((obj) => {
                const roles = findDirectiveWithName(obj, ROLES_DIRECTIVE);
                if (roles) {
                    validationMessages.push(
                        ValidationMessage.error(
                            VALIDATION_ERROR_ROLES_ON_NON_ROOT_ENTITY_TYPE,
                            roles,
                        ),
                    );
                }
            });
        return validationMessages;
    }
}
