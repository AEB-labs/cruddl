import {ASTTransformer} from "../ast-transformer";
import {
    DocumentNode,
    FieldDefinitionNode,
    InputObjectTypeDefinitionNode,
    InputValueDefinitionNode,
    ObjectTypeDefinitionNode,
    TypeNode
} from "graphql";
import {getNamedTypeDefinitionAST, getValueObjectTypes} from "../../schema-utils";
import {
    INPUT_OBJECT_TYPE_DEFINITION,
    LIST_TYPE,
    NAMED_TYPE,
    NON_NULL_TYPE,
    OBJECT_TYPE_DEFINITION
} from "graphql/language/kinds";
import {getCreateInputTypeName} from "../../../graphql/names";
import {buildInputValueNode} from "./add-input-type-transformation-helper";

export class AddValueObjectInputTypesTransformer implements ASTTransformer {

    transform(ast: DocumentNode): void {
        getValueObjectTypes(ast).forEach(objectType => {
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
                        return buildInputValueNode(field.name.value, getCreateInputTypeName(namedType));
                    default:
                        return buildInputValueNode(field.name.value, type.name.value, field.loc);
                }
            case LIST_TYPE:
                const effectiveType = type.type.kind === NON_NULL_TYPE ? type.type.type : type.type;
                if (effectiveType.kind === LIST_TYPE) {
                    throw new Error('Lists of lists are not allowed.');
                }
                return buildInputValueNode(field.name.value, effectiveType.name.value, field.loc);
        }
    }

}