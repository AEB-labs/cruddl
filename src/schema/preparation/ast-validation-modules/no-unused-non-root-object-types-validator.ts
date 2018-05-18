import { ASTValidator } from '../ast-validator';
import { DocumentNode, ObjectTypeDefinitionNode } from 'graphql';
import { ValidationMessage } from '../../../model/validation';
import {
    getNamedTypeDefinitionAST, getObjectTypes, getRootEntityTypes, getTypeNameIgnoringNonNullAndList
} from '../../schema-utils';
import { OBJECT_TYPE_ENTITY_DIRECTIVES } from '../../schema-defaults';

export const VALIDATION_WARNING_UNUSED_OBJECT_TYPE = "Unused object type.";

export class NoUnusedNonRootObjectTypesValidator implements ASTValidator {
    validate(ast: DocumentNode): ValidationMessage[] {
        // store all object types to a set
        const objectTypeNames = new Set<ObjectTypeDefinitionNode>(getObjectTypes(ast).map(objectType => objectType));
        // remove all root entities
        getRootEntityTypes(ast).forEach(rootType => {
            objectTypeNames.delete(rootType);
        });
        // remove all object types from the set which are referenced by some fields
        getObjectTypes(ast).forEach(objectType => objectType.fields.forEach(field => objectTypeNames.delete(getNamedTypeDefinitionAST(ast, getTypeNameIgnoringNonNullAndList(field.type)) as ObjectTypeDefinitionNode)));
        // remaining object types in set are unused, create warnings for them
        return Array.from(objectTypeNames).map(
            unusedType => ValidationMessage.warn(
                    VALIDATION_WARNING_UNUSED_OBJECT_TYPE,
                    {
                        entityKind: unusedType.directives!.find(
                            directive => OBJECT_TYPE_ENTITY_DIRECTIVES.includes(directive.name.value))!.name.value
                    },
                    unusedType.loc)
        );
    }

}
