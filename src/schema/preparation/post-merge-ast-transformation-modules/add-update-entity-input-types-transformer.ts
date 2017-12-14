import {ASTTransformer} from '../transformation-pipeline';
import {
    DocumentNode,
    FieldDefinitionNode,
    GraphQLID,
    InputObjectTypeDefinitionNode,
    InputValueDefinitionNode,
    ObjectTypeDefinitionNode,
    TypeNode
} from 'graphql';
import {
    findDirectiveWithName,
    getChildEntityTypes,
    getNamedTypeDefinitionAST,
    getRootEntityTypes,
    hasDirectiveWithName
} from '../../schema-utils';
import {
    INPUT_OBJECT_TYPE_DEFINITION,
    LIST_TYPE,
    NAMED_TYPE,
    NON_NULL_TYPE,
    OBJECT_TYPE_DEFINITION
} from 'graphql/language/kinds';
import {
    getAddChildEntityFieldName,
    getAddRelationFieldName,
    getCreateInputTypeName,
    getRemoveChildEntityFieldName,
    getRemoveRelationFieldName,
    getUpdateChildEntityFieldName,
    getUpdateInputTypeName
} from '../../../graphql/names';
import {
    CHILD_ENTITY_DIRECTIVE,
    ENTITY_CREATED_AT,
    ENTITY_UPDATED_AT,
    ID_FIELD,
    RELATION_DIRECTIVE, ROLES_DIRECTIVE
} from '../../schema-defaults';
import { compact, flatMap } from '../../../utils/utils';
import {
    buildInputFieldFromNonListField, buildInputFieldsFromCalcMutationField,
    buildInputValueListNodeFromField,
    buildInputValueNodeID
} from './add-input-type-transformation-helper-transformer';

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
            loc: objectType.loc,
            directives: compact([ findDirectiveWithName(objectType, ROLES_DIRECTIVE) ])
        }
    }

    // undefined currently means not supported.
    protected createInputTypeField(ast: DocumentNode, field: FieldDefinitionNode, type: TypeNode): InputValueDefinitionNode[] {
        switch (type.kind) {
            case NON_NULL_TYPE:
                return this.createInputTypeField(ast, field, type.type);
            case NAMED_TYPE:
                return [ buildInputFieldFromNonListField(ast, field, type), ...buildInputFieldsFromCalcMutationField(ast, field, type) ];
            case LIST_TYPE:
                const effectiveType = type.type.kind === NON_NULL_TYPE ? type.type.type : type.type;
                if (effectiveType.kind === LIST_TYPE) {
                    throw new Error('Lists of lists are not allowed.');
                }
                const namedTypeOfList = getNamedTypeDefinitionAST(ast, effectiveType.name.value);
                if (namedTypeOfList.kind === OBJECT_TYPE_DEFINITION) {
                    if (hasDirectiveWithName(field, RELATION_DIRECTIVE)) {
                        // add/remove by foreign key
                        return [
                            buildInputValueListNodeFromField(getAddRelationFieldName(field.name.value), GraphQLID.name, field),
                            buildInputValueListNodeFromField(getRemoveRelationFieldName(field.name.value), GraphQLID.name, field),
                        ];
                    }
                    if (hasDirectiveWithName(namedTypeOfList, CHILD_ENTITY_DIRECTIVE)) {
                        // add / update /remove with data
                        return [
                            buildInputValueListNodeFromField(getAddChildEntityFieldName(field.name.value), getCreateInputTypeName(namedTypeOfList), field),
                            buildInputValueListNodeFromField(getUpdateChildEntityFieldName(field.name.value), getUpdateInputTypeName(namedTypeOfList), field),
                            buildInputValueListNodeFromField(getRemoveChildEntityFieldName(field.name.value), GraphQLID.name, field),
                        ]
                    }
                    return [buildInputValueListNodeFromField(field.name.value, getUpdateInputTypeName(namedTypeOfList), field)];
                } else {
                    return [buildInputValueListNodeFromField(field.name.value, effectiveType.name.value, field)];
                }
        }
    }

}