import { ASTValidator } from '../ast-validator';
import { DocumentNode } from 'graphql';
import { ValidationMessage } from '../validation-message';
import {
    getNamedTypeDefinitionAST, getObjectTypes, getTypeNameIgnoringNonNullAndList, hasDirectiveWithName
} from '../../schema-utils';
import { RELATION_DIRECTIVE, ROOT_ENTITY_DIRECTIVE } from '../../schema-defaults';
import { OBJECT_TYPE_DEFINITION } from '../../../graphql/kinds';

export class RelationsOnlyToRootEntitiesValidator implements ASTValidator {

    validate(ast: DocumentNode): ValidationMessage[] {
        const validationMessages: ValidationMessage[] = [];
        getObjectTypes(ast).forEach(objectType => objectType.fields.forEach(field => {
            const relationDirective = field.directives ? field.directives.find(directive => directive.name.value === RELATION_DIRECTIVE) : undefined;
            if (relationDirective) {
                const namedTypeDefinition = getNamedTypeDefinitionAST(ast, getTypeNameIgnoringNonNullAndList(field.type));
                if (!namedTypeDefinition || namedTypeDefinition.kind !== OBJECT_TYPE_DEFINITION) {
                    // catch somewhere else
                    return;
                }
                if (!hasDirectiveWithName(namedTypeDefinition, ROOT_ENTITY_DIRECTIVE)) {
                    validationMessages.push(ValidationMessage.error(`"${namedTypeDefinition.name.value}" is not a root entity`, {}, relationDirective.loc))
                }
            }
        }));
        return validationMessages;
    }

}