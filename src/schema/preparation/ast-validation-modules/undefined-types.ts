import { ASTValidator } from '../ast-validator';
import { DocumentNode, NamedTypeNode, visit } from 'graphql';
import { ValidationMessage } from '../validation-message';
import { getNamedTypeDefinitionASTIfExists } from '../../schema-utils';

export const VALIDATION_ERROR_UNDEFINED_TYPE_REFERENCE = `Type not defined`;

export class UndefinedTypesValidator implements ASTValidator {
    validate(ast: DocumentNode): ValidationMessage[] {
        const validationMessages: ValidationMessage[] = [];
        visit(ast, {
            NamedType(node: NamedTypeNode) {
                if (!getNamedTypeDefinitionASTIfExists(ast, node.name.value)) {
                    validationMessages.push(ValidationMessage.error(VALIDATION_ERROR_UNDEFINED_TYPE_REFERENCE, { typeName: node.name.value }, node.loc));
                }
            }
        });
        return validationMessages;
    }
}
