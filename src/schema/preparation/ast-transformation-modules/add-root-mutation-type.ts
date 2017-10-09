import {ASTTransformer} from "../ast-transformer";
import {DocumentNode, FieldDefinitionNode, GraphQLID, ObjectTypeDefinitionNode} from "graphql";
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
import { ENTITY_ID, ID_FIELD, MUTATION_ID_ARG, MUTATION_INPUT_ARG, MUTATION_TYPE } from '../../schema-defaults';
import {
    allEntitiesQueryBy, createEntityQuery, deleteEntityQuery, getCreateInputTypeName, getUpdateInputTypeName,
    updateEntityQuery
} from "../../../graphql/names";

export class AddRootMutationTypeTransformer implements ASTTransformer {

    transform(ast: DocumentNode): void {
        ast.definitions.push(this.buildQueryFieldDefinition(ast))
    }

    protected buildQueryFieldDefinition(ast: DocumentNode): ObjectTypeDefinitionNode {
        return {
            kind: OBJECT_TYPE_DEFINITION,
            name: buildNameNode(MUTATION_TYPE),
            fields: this.buildMutationTypeRootEntityMutations(getRootEntityTypes(ast)),
        }
    }

    protected buildMutationTypeRootEntityMutations(rootEntityDefinitionNodes: ObjectTypeDefinitionNode[]): FieldDefinitionNode[] {
        return flatMap(rootEntityDefinitionNodes, rootEntityDef => [
            this.buildCreateMutation(rootEntityDef),
            this.buildUpdateMutation(rootEntityDef),
            this.buildDeleteMutation(rootEntityDef),
        ])
    }

    protected buildCreateMutation(rootEntityDef: ObjectTypeDefinitionNode): FieldDefinitionNode {
        return {
            kind: FIELD_DEFINITION,
            name: buildNameNode(createEntityQuery(rootEntityDef.name.value)),
            type: { kind: NON_NULL_TYPE, type: { kind: NAMED_TYPE, name: buildNameNode(rootEntityDef.name.value) } },
            arguments: [
                this.buildNonNullTypeInputArg(MUTATION_INPUT_ARG, getCreateInputTypeName(rootEntityDef)),
            ],
            loc: rootEntityDef.loc
        }
    }

    protected buildUpdateMutation(rootEntityDef: ObjectTypeDefinitionNode): FieldDefinitionNode {
        return {
            kind: FIELD_DEFINITION,
            name: buildNameNode(updateEntityQuery(rootEntityDef.name.value)),
            type: { kind: NAMED_TYPE, name: buildNameNode(rootEntityDef.name.value) },
            arguments: [
                this.buildNonNullTypeInputArg(MUTATION_INPUT_ARG, getUpdateInputTypeName(rootEntityDef)),
            ],
            loc: rootEntityDef.loc
        }
    }

    protected buildDeleteMutation(rootEntityDef: ObjectTypeDefinitionNode): FieldDefinitionNode {
        return {
            kind: FIELD_DEFINITION,
            name: buildNameNode(deleteEntityQuery(rootEntityDef.name.value)),
            type: { kind: NAMED_TYPE, name: buildNameNode(rootEntityDef.name.value) },
            arguments: [
                this.buildNonNullTypeInputArg(MUTATION_ID_ARG, GraphQLID.name),
            ],
            loc: rootEntityDef.loc
        }
    }

    protected buildNonNullTypeInputArg(name: string, namedTypeName: string) {
        return {
            kind: INPUT_VALUE_DEFINITION,
            name: buildNameNode(name),
            type: {
                kind: NON_NULL_TYPE,
                type: {
                    kind: NAMED_TYPE,
                    name: buildNameNode(namedTypeName)
                }
            }
        };
    }

}