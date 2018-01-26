import { ASTValidationContext, ASTValidator } from '../ast-validator';
import { DocumentNode, GraphQLString, NamedTypeNode, TypeNode, visit } from 'graphql';
import { ValidationMessage } from '../validation-message';
import {
    findDirectiveWithName, getNamedTypeDefinitionAST, getNamedTypeDefinitionASTIfExists, getNodeByName,
    getRootEntityTypes
} from '../../schema-utils';
import { ACCESS_GROUP_FIELD, PERMISSION_PROFILE_ARG, ROOT_ENTITY_DIRECTIVE } from '../../schema-defaults';

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
