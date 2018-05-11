import {ASTValidator} from "../ast-validator";
import {DocumentNode} from "graphql";
import {ValidationMessage} from "../../../model/validation/message";
import {
    getNamedTypeDefinitionAST,
    getObjectTypes,
    getTypeNameIgnoringNonNullAndList,
    hasDirectiveWithName
} from "../../schema-utils";
import {KEY_FIELD_DIRECTIVE, REFERENCE_DIRECTIVE, ROOT_ENTITY_DIRECTIVE} from "../../schema-defaults";
import {OBJECT_TYPE_DEFINITION} from "../../../graphql/kinds";

export class ReferenceOnlyToRootEntitiesWithKeyFieldValidator implements ASTValidator {

    validate(ast: DocumentNode): ValidationMessage[] {
        const validationMessages: ValidationMessage[] = [];
        getObjectTypes(ast).forEach(objectType => objectType.fields.forEach(field => {
            const referenceDirective = field.directives ? field.directives.find(directive => directive.name.value === REFERENCE_DIRECTIVE) : undefined;
            if (referenceDirective) {
                const namedTypeDefinition = getNamedTypeDefinitionAST(ast, getTypeNameIgnoringNonNullAndList(field.type));
                if (!namedTypeDefinition || namedTypeDefinition.kind !== OBJECT_TYPE_DEFINITION) {
                    // catch somewhere else
                    return;
                }
                if (!hasDirectiveWithName(namedTypeDefinition, ROOT_ENTITY_DIRECTIVE)) {
                    validationMessages.push(ValidationMessage.error(`"${namedTypeDefinition.name.value}" is not a root entity`, {}, referenceDirective.loc))
                }
                if (!namedTypeDefinition.fields.some(field => hasDirectiveWithName(field, KEY_FIELD_DIRECTIVE))) {
                    validationMessages.push(ValidationMessage.error(`"${namedTypeDefinition.name.value}" has no @key field`, { rootEntity: namedTypeDefinition.name.value }, referenceDirective.loc))
                }
            }
        }));
        return validationMessages;
    }

}