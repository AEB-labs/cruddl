import {FieldDefinitionNode, NamedTypeNode, ObjectTypeDefinitionNode} from "graphql";

export function objectTypeFieldsWithNameOfNamedType(objectType: ObjectTypeDefinitionNode, name: string, namedType: string): FieldDefinitionNode[] {
    return objectType.fields.filter(field => field.name.value === name && (<NamedTypeNode>field.type).name.value === namedType);
}