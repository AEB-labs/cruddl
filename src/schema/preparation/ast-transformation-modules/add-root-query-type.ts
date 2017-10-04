import {ASTTransformer} from "../ast-transformer";
import {DocumentNode, FieldDefinitionNode, ObjectTypeDefinitionNode} from "graphql";
import {buildNameNode, getRootEntityTypes} from "../../schema-utils";
import {
    FIELD_DEFINITION,
    INPUT_VALUE_DEFINITION,
    LIST_TYPE,
    NAMED_TYPE,
    NON_NULL_TYPE,
    OBJECT_TYPE_DEFINITION
} from "graphql/language/kinds";
import {flatMap} from "../../../utils/utils";
import {ENTITY_ID, QUERY_TYPE} from '../../schema-defaults';
import {allEntitiesQueryBy} from "../../../graphql/names";

export class AddRootQueryTypeTransformer implements ASTTransformer {

    transform(ast: DocumentNode): void {
        ast.definitions.push(this.buildQueryFieldDefinition(ast))
    }

    protected buildQueryFieldDefinition(ast: DocumentNode): ObjectTypeDefinitionNode {
        return {
            kind: OBJECT_TYPE_DEFINITION,
            name: buildNameNode(QUERY_TYPE),
            fields: this.buildQueryTypeEntityFields(getRootEntityTypes(ast)),
        }
    }

    protected buildQueryTypeEntityFields(entityDefinitionNodes: ObjectTypeDefinitionNode[]): FieldDefinitionNode[] {
        return flatMap(entityDefinitionNodes, entityDef => [
            this.buildQueryOneEntityField(entityDef),
            this.buildQueryAllEntityField(entityDef),
        ])
    }

    protected buildQueryOneEntityField(entityDef: ObjectTypeDefinitionNode): FieldDefinitionNode {
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

    protected buildQueryAllEntityField(entityDef: ObjectTypeDefinitionNode): FieldDefinitionNode {
        return {
            kind: FIELD_DEFINITION,
            name: buildNameNode(allEntitiesQueryBy(entityDef.name.value)),
            type: { kind: LIST_TYPE, type: { kind: NON_NULL_TYPE, type: { kind: NAMED_TYPE, name: buildNameNode(entityDef.name.value) }} },
            arguments: [], // arguments will be added later
            loc: entityDef.loc
        }
    }
}