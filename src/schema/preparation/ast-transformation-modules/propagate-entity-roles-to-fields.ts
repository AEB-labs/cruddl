import { ASTTransformer } from '../ast-transformer';
import { DocumentNode, FieldDefinitionNode, ObjectTypeDefinitionNode, TypeNode } from 'graphql';
import { findDirectiveWithName, getNamedTypeDefinitionAST, getObjectTypes } from '../../schema-utils';
import { LIST_TYPE, NAMED_TYPE, NON_NULL_TYPE, OBJECT_TYPE_DEFINITION } from 'graphql/language/kinds';
import { intersectRolesDirectives } from './add-input-type-transformation-helper';
import { ROLES_DIRECTIVE } from '../../schema-defaults';
import { compact } from '../../../utils/utils';

export class PropagateEntityRolesToFieldsTransformer implements ASTTransformer {

    transform(ast: DocumentNode): void {
        getObjectTypes(ast).forEach(objectType => {
            this.propagateEntityRolesToFields(ast, objectType);
        });
    }

    protected propagateEntityRolesToFields(ast: DocumentNode, objectType: ObjectTypeDefinitionNode) {
        for (const field of objectType.fields) {
            this.propagateEntityRolesToField(ast, field, field.type);
        }
    }

    protected propagateEntityRolesToField(ast: DocumentNode, field: FieldDefinitionNode, type: TypeNode) {
        switch (type.kind) {
            case NON_NULL_TYPE:
                this.propagateEntityRolesToField(ast, field, type.type);
                break;
            case LIST_TYPE:
                this.propagateEntityRolesToField(ast, field, type.type);
                break;
            case NAMED_TYPE:
                const objectType = getNamedTypeDefinitionAST(ast, type.name.value);
                if (objectType && objectType.kind == OBJECT_TYPE_DEFINITION) {
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
