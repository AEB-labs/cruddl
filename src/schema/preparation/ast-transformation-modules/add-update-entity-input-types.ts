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
import {
    getChildEntityTypes,
    getNamedTypeDefinitionAST,
    getRootEntityTypes,
    hasObjectTypeDirectiveWithName
} from "../../schema-utils";
import {
    INPUT_OBJECT_TYPE_DEFINITION,
    LIST_TYPE,
    NAMED_TYPE,
    NON_NULL_TYPE,
    OBJECT_TYPE_DEFINITION
} from "graphql/language/kinds";
import {
    getAddChildEntityFieldName,
    getAddRelationFieldName,
    getCreateInputTypeName,
    getRemoveChildEntityFieldName,
    getRemoveRelationFieldName,
    getUpdateChildEntityFieldName,
    getUpdateInputTypeName,
} from "../../../graphql/names";
import {
    CHILD_ENTITY_DIRECTIVE,
    ENTITY_CREATED_AT,
    ENTITY_UPDATED_AT,
    ID_FIELD,
    ROOT_ENTITY_DIRECTIVE
} from "../../schema-defaults";
import {flatMap} from "../../../utils/utils";
import {
    buildInputValueListNode,
    buildInputValueNode,
    buildInputValueNodeID
} from "./add-input-type-transformation-helper";

export class AddUpdateEntityInputTypesTransformer implements ASTTransformer {

    transform(ast: DocumentNode): void {
        getRootEntityTypes(ast).forEach(objectType => {
            ast.definitions.push(this.createUpdateInputTypeForObjectType(ast, objectType));
        });
        getChildEntityTypes(ast).forEach(objectType => {
            ast.definitions.push(this.createUpdateInputTypeForObjectType(ast, objectType));
        })
    }

    protected createUpdateInputTypeForObjectType(ast: DocumentNode, objectType: ObjectTypeDefinitionNode): InputObjectTypeDefinitionNode {
        // create input fields for all entity fields except createdAt, updatedAt
        const skip = [ID_FIELD, ENTITY_CREATED_AT, ENTITY_UPDATED_AT];
        const args = [
            buildInputValueNodeID(),
            ...flatMap(objectType.fields.filter(field => !skip.includes(field.name.value)), field => this.createInputTypeField(ast, field, field.type))
        ];
        return {
            kind: INPUT_OBJECT_TYPE_DEFINITION,
            name: { kind: "Name", value: getUpdateInputTypeName(objectType) },
            fields: args,
            loc: objectType.loc
        }
    }

    // undefined currently means not supported.
    protected createInputTypeField(ast: DocumentNode, field: FieldDefinitionNode, type: TypeNode): InputValueDefinitionNode[] {
        switch (type.kind) {
            case NON_NULL_TYPE:
                return this.createInputTypeField(ast, field, type.type);
            case NAMED_TYPE:
                const namedType = getNamedTypeDefinitionAST(ast, type.name.value);
                if (namedType.kind === OBJECT_TYPE_DEFINITION) {
                    return [buildInputValueNode(field.name.value, getUpdateInputTypeName(namedType))];
                } else {
                    return [buildInputValueNode(field.name.value, type.name.value, field.loc)];
                }
            case LIST_TYPE:
                const effectiveType = type.type.kind === NON_NULL_TYPE ? type.type.type : type.type;
                if (effectiveType.kind === LIST_TYPE) {
                    throw new Error('Lists of lists are not allowed.');
                }
                const namedTypeOfList = getNamedTypeDefinitionAST(ast, effectiveType.name.value);
                if (namedTypeOfList.kind === OBJECT_TYPE_DEFINITION) {
                    if (hasObjectTypeDirectiveWithName(namedTypeOfList, ROOT_ENTITY_DIRECTIVE)) {
                        // add/remove by foreign key
                        return [
                            buildInputValueListNode(getAddRelationFieldName(field.name.value), GraphQLID.name),
                            buildInputValueListNode(getRemoveRelationFieldName(field.name.value), GraphQLID.name),
                        ];
                    }
                    if (hasObjectTypeDirectiveWithName(namedTypeOfList, CHILD_ENTITY_DIRECTIVE)) {
                        // add / update /remove with data
                        return [
                            buildInputValueListNode(getAddChildEntityFieldName(field.name.value), getCreateInputTypeName(namedTypeOfList)),
                            buildInputValueListNode(getUpdateChildEntityFieldName(field.name.value), getUpdateInputTypeName(namedTypeOfList)),
                            buildInputValueListNode(getRemoveChildEntityFieldName(field.name.value), GraphQLID.name),
                        ]
                    }
                    return [buildInputValueListNode(field.name.value, getUpdateInputTypeName(namedTypeOfList), field.loc)];
                } else {
                    return [buildInputValueListNode(field.name.value, effectiveType.name.value, field.loc)];
                }
        }
    }

}