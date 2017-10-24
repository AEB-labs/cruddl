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
    getEntityExtensionTypes, getNamedTypeDefinitionAST, getReferenceKeyField, hasDirectiveWithName
} from '../../schema-utils';
import {
    INPUT_OBJECT_TYPE_DEFINITION,
    LIST_TYPE,
    NAMED_TYPE,
    NON_NULL_TYPE,
    OBJECT_TYPE_DEFINITION
} from "graphql/language/kinds";
import {getCreateInputTypeName} from "../../../graphql/names";
import { REFERENCE_DIRECTIVE, ROOT_ENTITY_DIRECTIVE } from '../../schema-defaults';
import {
    buildInputFieldFromNonListField, buildInputValueListNode, buildInputValueNodeFromField
} from './add-input-type-transformation-helper';

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
                return buildInputFieldFromNonListField(ast, field, type);
            case LIST_TYPE:
                const effectiveType = type.type.kind === NON_NULL_TYPE ? type.type.type : type.type;
                if (effectiveType.kind === LIST_TYPE) {
                    throw new Error('Lists of lists are not allowed.');
                }
                const namedTypeOfList = getNamedTypeDefinitionAST(ast, effectiveType.name.value);
                switch (namedTypeOfList.kind) {
                    case OBJECT_TYPE_DEFINITION:
                        if (hasDirectiveWithName(namedTypeOfList, ROOT_ENTITY_DIRECTIVE)) {
                            // foreign key
                            return buildInputValueListNode(field.name.value, GraphQLID.name);
                        } else {
                            return buildInputValueListNode(field.name.value, getCreateInputTypeName(namedTypeOfList))
                        }
                    default:
                        return buildInputValueListNode(field.name.value, effectiveType.name.value, field.loc);
                }
        }
    }

}