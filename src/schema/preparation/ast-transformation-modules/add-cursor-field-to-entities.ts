import {ASTTransformer} from "../ast-transformer";
import {DocumentNode, FieldDefinitionNode} from "graphql";
import {buildNameNode, getChildEntityTypes, getEntityTypes, getValueObjectTypes} from "../../schema-utils";
import {FIELD_DEFINITION, NAMED_TYPE} from "graphql/language/kinds";
import {CURSOR_FIELD} from "../../schema-defaults";

export class AddCursorFieldToEntitiesTransformer implements ASTTransformer {

    transform(ast: DocumentNode): void {

        const cursorFieldDefinition : FieldDefinitionNode = {
            kind: FIELD_DEFINITION,
            type: {
                kind: NAMED_TYPE,
                name: buildNameNode('String')
            },
            name: buildNameNode(CURSOR_FIELD),
            arguments: []
        };

        getEntityTypes(ast).forEach(entityType => {
            entityType.fields.push(cursorFieldDefinition)
        });
        getChildEntityTypes(ast).forEach(entityType => {
            entityType.fields.push(cursorFieldDefinition)
        });
        getValueObjectTypes(ast).forEach(entityType => {
            entityType.fields.push(cursorFieldDefinition)
        });

    }

}