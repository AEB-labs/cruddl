import {ASTTransformer} from "../../../../src/schema/preparation/ast-transformer";
import {DocumentNode} from "graphql";
import {buildNameNode, getEntityTypes} from "../../../../src/schema/schema-utils";
import {FIELD_DEFINITION, NAMED_TYPE} from "graphql/language/kinds";
import {CURSOR_FIELD} from "../../../../src/schema/schema-defaults";

export class AddCursorFieldToEntitiesTransformer implements ASTTransformer {

    transform(ast: DocumentNode): void {
        getEntityTypes(ast).forEach(entityType => {
            entityType.fields.push({
                kind: FIELD_DEFINITION,
                type: {
                    kind: NAMED_TYPE,
                    name: buildNameNode('String')
                },
                name: buildNameNode(CURSOR_FIELD),
                arguments: []
            })
        })
    }

}