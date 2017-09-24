import {ASTTransformer} from "../ast-transformer";
import {DocumentNode, FieldDefinitionNode, ObjectTypeDefinitionNode, SchemaDefinitionNode} from "graphql";
import {buildNameNode, getEntityTypes} from "../../schema-utils";
import {
    FIELD_DEFINITION, INPUT_VALUE_DEFINITION, LIST, LIST_TYPE, NAME, NAMED_TYPE, NON_NULL_TYPE,
    OBJECT_TYPE_DEFINITION, OPERATION_TYPE_DEFINITION, SCHEMA_DEFINITION
} from "graphql/language/kinds";
import {QueryNode} from "../../../query/definition";
import {flatMap} from "../../../utils/utils";
import {ENTITY_ID, FILTER_ARG} from "../../schema-defaults";
import {allEntitiesQueryBy} from "../../../graphql/names";

export class AddRootQueryTypeTransformer implements ASTTransformer {

    transform(ast: DocumentNode): void {
        ast.definitions.push(this.buildQueryFieldDefinition(ast))
    }

    protected buildQueryFieldDefinition(ast: DocumentNode): ObjectTypeDefinitionNode {
        return {
            kind: OBJECT_TYPE_DEFINITION,
            name: buildNameNode('Query'),
            fields: this.buildQueryTypeEntityFields(getEntityTypes(ast)),
        }
    }

    protected buildQueryTypeEntityFields(entityDefinitionNodes: ObjectTypeDefinitionNode[]): FieldDefinitionNode[] {
        return flatMap(entityDefinitionNodes, entityDef => [
            this.buildFindOneEntityField(entityDef),
            this.buildFindAllEntityField(entityDef),
        ])
    }

    protected buildFindOneEntityField(entityDef: ObjectTypeDefinitionNode): FieldDefinitionNode {
        return {
            kind: FIELD_DEFINITION,
            name: buildNameNode(entityDef.name.value),
            type: { kind: NAMED_TYPE, name: buildNameNode(entityDef.name.value) },
            arguments: [{
                kind: INPUT_VALUE_DEFINITION,
                name: buildNameNode(ENTITY_ID),
                type: { kind: NAMED_TYPE,  name: buildNameNode('ID')}
            }],
            loc: entityDef.loc
        }
    }

    protected buildFindAllEntityField(entityDef: ObjectTypeDefinitionNode): FieldDefinitionNode {
        return {
            kind: FIELD_DEFINITION,
            name: buildNameNode(allEntitiesQueryBy(entityDef.name.value)),
            type: { kind: LIST_TYPE, type: { kind: NON_NULL_TYPE, type: { kind: NAMED_TYPE, name: buildNameNode(entityDef.name.value) }} },
            arguments: [
                {
                    kind: INPUT_VALUE_DEFINITION,
                    name: buildNameNode(FILTER_ARG),
                    type: { kind: NAMED_TYPE,  name: buildNameNode('ID')}
                }
            ],
            loc: entityDef.loc
        }
    }
}