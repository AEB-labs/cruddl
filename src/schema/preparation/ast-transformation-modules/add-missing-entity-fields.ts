import {ASTTransformer} from "../ast-transformer";
import {DocumentNode} from "graphql";
import {createFieldDefinitionNode, fieldDefinitionNodeByNameExists, getEntityTypes} from "../../schema-utils";
import {DATETIME, ENTITY_CREATED_AT, ENTITY_ID, ENTITY_UPDATED_AT} from "../../schema-defaults";

/**
 * Assert that all @Entity have the fields id, updatedAt, createdAt.
 */
export class AddMissingEntityFieldsTransformer implements ASTTransformer {

    transform(ast: DocumentNode): void {
        this.extendRootEntityTypes(ast);
    }

    protected extendRootEntityTypes(ast: DocumentNode) {
        getEntityTypes(ast).forEach(moType => {
            // assert existence of ID field
            // TODO better remove existing fields with the following names because they could contain bullshit (wrong type, args...).
            if (!fieldDefinitionNodeByNameExists(moType, ENTITY_ID)) {
                moType.fields.push(createFieldDefinitionNode(ENTITY_ID, 'ID', moType.loc));
            }
            // assert existence of createdAt field
            if (!fieldDefinitionNodeByNameExists(moType, ENTITY_CREATED_AT)) {
                moType.fields.push(createFieldDefinitionNode(ENTITY_CREATED_AT, DATETIME, moType.loc));
            }
            // assert existence of updatedAt field
            if (!fieldDefinitionNodeByNameExists(moType, ENTITY_UPDATED_AT)) {
                moType.fields.push(createFieldDefinitionNode(ENTITY_UPDATED_AT, DATETIME, moType.loc));
            }
        });
    }

}