import {ASTTransformer} from "../transformation-pipeline";
import {DocumentNode, FieldDefinitionNode, InputValueDefinitionNode, ObjectTypeDefinitionNode} from "graphql";
import {buildNameNode, getRootEntityTypes, getTypeNameIgnoringNonNullAndList} from "../../schema-utils";
import {
    FIELD_DEFINITION,
    INPUT_VALUE_DEFINITION,
    LIST_TYPE,
    NAMED_TYPE,
    NON_NULL_TYPE,
    OBJECT_TYPE_DEFINITION
} from "graphql/language/kinds";
import {flatMap, mapNullable} from '../../../utils/utils';
import {ENTITY_ID, KEY_FIELD_DIRECTIVE, QUERY_TYPE, ROLES_DIRECTIVE} from '../../schema-defaults';
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
            arguments: [
                {
                    kind: INPUT_VALUE_DEFINITION,
                    name: buildNameNode(ENTITY_ID),
                    type: { kind: NAMED_TYPE,  name: buildNameNode('ID')}
                },
                ...this.buildQueryOneInputFiltersForKeyFields(entityDef)
            ],
            loc: entityDef.loc,
            directives: mapNullable(entityDef.directives, directives => directives.filter(dir => dir.name.value == ROLES_DIRECTIVE))
        }
    }

    protected buildQueryAllEntityField(entityDef: ObjectTypeDefinitionNode): FieldDefinitionNode {
        return {
            kind: FIELD_DEFINITION,
            name: buildNameNode(allEntitiesQueryBy(entityDef.name.value)),
            type: { kind: LIST_TYPE, type: { kind: NON_NULL_TYPE, type: { kind: NAMED_TYPE, name: buildNameNode(entityDef.name.value) }} },
            arguments: [], // arguments will be added later
            loc: entityDef.loc,
            directives: mapNullable(entityDef.directives, directives => directives.filter(dir => dir.name.value == ROLES_DIRECTIVE))
        }
    }

    private buildQueryOneInputFiltersForKeyFields(entityDef: ObjectTypeDefinitionNode): InputValueDefinitionNode[] {
        const keyFields = entityDef.fields.filter(field => field.directives && field.directives.some(directive => directive.name.value === KEY_FIELD_DIRECTIVE))
        return keyFields.map(field => ({
            kind: INPUT_VALUE_DEFINITION,
            loc: field.loc,
            name: field.name,
            type: {
                kind: NAMED_TYPE,
                name: buildNameNode(getTypeNameIgnoringNonNullAndList(field.type))
            },
            directives: mapNullable(field.directives, directives => directives.filter(dir => dir.name.value == ROLES_DIRECTIVE))
        }));
    }

}