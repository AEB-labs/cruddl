import {ASTTransformer} from "../ast-transformer";
import {
    DocumentNode,
    FieldDefinitionNode,
    GraphQLID,
    InputObjectTypeDefinitionNode,
    InputValueDefinitionNode,
    ObjectTypeDefinitionNode,
    TypeNode
} from "graphql";
import {getEntityExtensionTypes, getNamedTypeDefinitionAST, hasObjectTypeDirectiveWithName} from "../../schema-utils";
import {
    INPUT_OBJECT_TYPE_DEFINITION,
    LIST_TYPE,
    NAMED_TYPE,
    NON_NULL_TYPE,
    OBJECT_TYPE_DEFINITION
} from "graphql/language/kinds";
import {getCreateInputTypeName} from "../../../graphql/names";
import {ROOT_ENTITY_DIRECTIVE} from "../../schema-defaults";
import {buildInputValueListNode, buildInputValueNode} from "./add-input-type-transformation-helper";

export class AddExtensionInputTypesTransformer implements ASTTransformer {

    transform(ast: DocumentNode): void {
        getEntityExtensionTypes(ast).forEach(objectType => {
            ast.definitions.push(this.createCreateInputTypeForObjectType(ast, objectType));
        });
    }

    protected createCreateInputTypeForObjectType(ast: DocumentNode, objectType: ObjectTypeDefinitionNode): InputObjectTypeDefinitionNode {
        // create input fields for all entity fields except ID, createdAt, updatedAt
        const args = [
            ...objectType.fields.map(field => this.createInputTypeField(ast, field, field.type))
        ];
        return {
            kind: INPUT_OBJECT_TYPE_DEFINITION,
            name: { kind: "Name", value: getCreateInputTypeName(objectType) },
            fields: args,
            loc: objectType.loc
        }
    }

    // undefined currently means not supported.
    protected createInputTypeField(ast: DocumentNode, field: FieldDefinitionNode, type: TypeNode): InputValueDefinitionNode {
        switch (type.kind) {
            case NON_NULL_TYPE:
                return this.createInputTypeField(ast, field, type.type);
            case NAMED_TYPE:
                const namedType = getNamedTypeDefinitionAST(ast, type.name.value);
                switch (namedType.kind) {
                    case OBJECT_TYPE_DEFINITION:
                        if (hasObjectTypeDirectiveWithName(namedType, ROOT_ENTITY_DIRECTIVE)) {
                            // referenced by foreign key
                            return buildInputValueNode(field.name.value, GraphQLID.name)
                        } else {
                            return buildInputValueNode(field.name.value, getCreateInputTypeName(namedType))
                        }
                    default:
                        return buildInputValueNode(field.name.value, type.name.value, field.loc);
                }
            case LIST_TYPE:
                const effectiveType = type.type.kind === NON_NULL_TYPE ? type.type.type : type.type;
                if (effectiveType.kind === LIST_TYPE) {
                    throw new Error('Lists of lists are not allowed.');
                }
                const namedTypeOfList = getNamedTypeDefinitionAST(ast, effectiveType.name.value);
                switch (namedTypeOfList.kind) {
                    case OBJECT_TYPE_DEFINITION:
                        if (hasObjectTypeDirectiveWithName(namedTypeOfList, ROOT_ENTITY_DIRECTIVE)) {
                            // foreign key
                            return buildInputValueListNode(field.name.value, GraphQLID.name);
                        } else {
                            return buildInputValueListNode(field.name.value, getCreateInputTypeName(namedTypeOfList))
                        }
                    default:
                        return buildInputValueNode(field.name.value, effectiveType.name.value, field.loc);
                }
        }
    }

}