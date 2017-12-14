import {ASTTransformer} from '../transformation-pipeline';
import {
    DocumentNode,
    FieldDefinitionNode,
    InputObjectTypeDefinitionNode,
    InputValueDefinitionNode,
    ObjectTypeDefinitionNode,
    TypeNode
} from 'graphql';
import { findDirectiveWithName, getValueObjectTypes } from '../../schema-utils';
import {INPUT_OBJECT_TYPE_DEFINITION, LIST_TYPE, NAMED_TYPE, NON_NULL_TYPE} from 'graphql/language/kinds';
import {getCreateInputTypeName} from '../../../graphql/names';
import {
    buildInputFieldFromNonListField,
    buildInputValueListNodeFromField
} from './add-input-type-transformation-helper-transformer';
import { ROLES_DIRECTIVE } from '../../schema-defaults';
import { compact } from '../../../utils/utils';

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
            loc: objectType.loc,
            directives: compact([ findDirectiveWithName(objectType, ROLES_DIRECTIVE) ])
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
                return buildInputValueListNodeFromField(field.name.value, effectiveType.name.value, field);
        }
    }

}