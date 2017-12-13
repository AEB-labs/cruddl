import { ASTTransformer } from '../transformation-pipeline';
import {
    DocumentNode, FieldDefinitionNode, InputObjectTypeDefinitionNode, InputValueDefinitionNode,
    ObjectTypeDefinitionNode, TypeNode
} from 'graphql';
import { findDirectiveWithName, getNamedTypeDefinitionAST } from '../../schema-utils';
import {
    INPUT_OBJECT_TYPE_DEFINITION, LIST_TYPE, NAMED_TYPE, NON_NULL_TYPE, OBJECT_TYPE_DEFINITION
} from 'graphql/language/kinds';
import { intersectRolesDirectives } from './add-input-type-transformation-helper-transformer';
import { ROLES_DIRECTIVE } from '../../schema-defaults';
import { compact } from '../../../utils/utils';

/**
 * For fields with object/input object types, merges the @roles directive of the referenced type into the @roles directive
 * of the field itself, so that the authorization-inspector only needs to check field directives
 *
 * This transformer is executed very late so that all types and fields are created. We do this after the generation of
 * derived types such as filter and input types because some fields change type when being copied into the derived types
 * E.g., fields to set @reference values are changed from the target type to the key type, and it would be wrong to
 * require write access to the referenced entity just to set the reference. It would probably be even better to require
 * read access to the referenced entities because one could use a reference to a forbidden type to check for key
 * existence, but this scenario should not occur in normal schemas anyway and even if it does, it would be a low risk.
 * Requiring read access to referenced objects would increase complexity significantly.
 */
export class PropagateTypeRolesToFieldsTransformer implements ASTTransformer {

    transform(ast: DocumentNode): void {
        for (const def of ast.definitions) {
            if (def.kind === OBJECT_TYPE_DEFINITION || def.kind == INPUT_OBJECT_TYPE_DEFINITION) {
                this.propagateEntityRolesToFields(ast, def);
            }
        }
    }

    protected propagateEntityRolesToFields(ast: DocumentNode, objectType: ObjectTypeDefinitionNode|InputObjectTypeDefinitionNode) {
        for (const field of objectType.fields) {
            this.propagateEntityRolesToField(ast, field, field.type);
        }
    }

    protected propagateEntityRolesToField(ast: DocumentNode, field: FieldDefinitionNode|InputValueDefinitionNode, type: TypeNode) {
        switch (type.kind) {
            case NON_NULL_TYPE:
                this.propagateEntityRolesToField(ast, field, type.type);
                break;
            case LIST_TYPE:
                this.propagateEntityRolesToField(ast, field, type.type);
                break;
            case NAMED_TYPE:
                const objectType = getNamedTypeDefinitionAST(ast, type.name.value);
                if (objectType && (objectType.kind == OBJECT_TYPE_DEFINITION || objectType.kind == INPUT_OBJECT_TYPE_DEFINITION)) {
                    const fieldDirective = findDirectiveWithName(field, ROLES_DIRECTIVE);
                    const objectDirective = findDirectiveWithName(objectType, ROLES_DIRECTIVE);
                    const intersectionDirective = intersectRolesDirectives(compact([fieldDirective, objectDirective]));

                    // remove old
                    if (field.directives) {
                        field.directives = field.directives.filter(directive => directive.name.value != ROLES_DIRECTIVE);
                    }
                    // add new
                    if (intersectionDirective) {
                        if (field.directives) {
                            field.directives.push(intersectionDirective);
                        } else {
                            field.directives = [ intersectionDirective ];
                        }
                    }
                }
                break;
        }
    }
}
