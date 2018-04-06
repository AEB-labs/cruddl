import { mapNullable } from '../../../utils/utils';
import {ASTTransformer} from "../transformation-pipeline";
import { DirectiveNode, DocumentNode, FieldDefinitionNode, GraphQLID, GraphQLInt, ObjectTypeDefinitionNode } from 'graphql';
import {
    buildNameNode,
    createObjectTypeNode,
    enterOrCreateNextNamespacePart,
    findDirectiveWithName,
    getNodeByName,
    getRootEntityTypes
} from "../../schema-utils";
import {
    DIRECTIVE, FIELD_DEFINITION, INPUT_VALUE_DEFINITION, LIST_TYPE, NAMED_TYPE, NON_NULL_TYPE,
    STRING
} from "../../../graphql/kinds";
import {
    FILTER_ARG, FIRST_ARG,
    MUTATION_FIELD,
    MUTATION_ID_ARG,
    MUTATION_INPUT_ARG,
    MUTATION_TYPE,
    NAMESPACE_DIRECTIVE,
    NAMESPACE_NAME_ARG,
    NAMESPACE_SEPARATOR, ORDER_BY_ARG,
    ROLES_DIRECTIVE
} from '../../schema-defaults';
import {
    createEntityQuery, deleteAllEntitiesQuery,
    deleteEntityQuery,
    getCreateInputTypeName, getFilterTypeName, getOrderByEnumTypeName, getUpdateAllInputTypeName,
    getUpdateInputTypeName, updateAllEntitiesQuery,
    updateEntityQuery
} from '../../../graphql/names';
import {compact} from "graphql-transformer/dist/src/utils";

const MUTATION_FIELD_DIRECTIVE: DirectiveNode = {
    name: buildNameNode(MUTATION_FIELD), kind: DIRECTIVE
};

export class AddRootMutationTypeTransformer implements ASTTransformer {

    transform(ast: DocumentNode): void {
        const rootMutatuinField = createObjectTypeNode(MUTATION_TYPE);
        ast.definitions.push(rootMutatuinField);
        getRootEntityTypes(ast).forEach(rootEntityType => buildMutationTypeEntityFieldsIntoNamespace(ast, rootEntityType, rootMutatuinField))
    }
}

function buildMutationTypeEntityFieldsIntoNamespace(ast: DocumentNode, rootEntityType: ObjectTypeDefinitionNode, rootQueryField: ObjectTypeDefinitionNode) {
    let currentNode = rootQueryField;
    const namespaceDirective = findDirectiveWithName(rootEntityType, NAMESPACE_DIRECTIVE);
    if (namespaceDirective && namespaceDirective.arguments) {
        const nameArg = getNodeByName(namespaceDirective.arguments, NAMESPACE_NAME_ARG);
        if (nameArg && nameArg.value.kind === STRING && nameArg.value.value) {
            const namespace = nameArg.value.value;
            // loop through namespaces and create intermediate fields and types
            namespace.split(NAMESPACE_SEPARATOR).forEach(namespacePart => {
                currentNode = enterOrCreateNextNamespacePart(ast, currentNode, namespacePart, MUTATION_TYPE);
            });
        }
    }
    currentNode.fields.push(
        buildCreateMutation(rootEntityType),
        buildUpdateMutation(rootEntityType),
        buildUpdateAllMutation(rootEntityType),
        buildDeleteMutation(rootEntityType),
        buildDeleteAllMutation(rootEntityType)
    )
}

function buildCreateMutation(rootEntityDef: ObjectTypeDefinitionNode): FieldDefinitionNode {
    return {
        kind: FIELD_DEFINITION,
        name: buildNameNode(createEntityQuery(rootEntityDef.name.value)),
        type: { kind: NON_NULL_TYPE, type: { kind: NAMED_TYPE, name: buildNameNode(rootEntityDef.name.value) } },
        arguments: [
            buildNonNullTypeInputArg(MUTATION_INPUT_ARG, getCreateInputTypeName(rootEntityDef)),
        ],
        loc: rootEntityDef.loc,
        directives: compact([findDirectiveWithName(rootEntityDef, ROLES_DIRECTIVE), MUTATION_FIELD_DIRECTIVE])
    }
}

function buildUpdateMutation(rootEntityDef: ObjectTypeDefinitionNode): FieldDefinitionNode {
    return {
        kind: FIELD_DEFINITION,
        name: buildNameNode(updateEntityQuery(rootEntityDef.name.value)),
        type: { kind: NAMED_TYPE, name: buildNameNode(rootEntityDef.name.value) },
        arguments: [
            buildNonNullTypeInputArg(MUTATION_INPUT_ARG, getUpdateInputTypeName(rootEntityDef)),
        ],
        loc: rootEntityDef.loc,
        directives: compact([findDirectiveWithName(rootEntityDef, ROLES_DIRECTIVE), MUTATION_FIELD_DIRECTIVE])
    }
}

function buildUpdateAllMutation(rootEntityDef: ObjectTypeDefinitionNode): FieldDefinitionNode {
    return {
        kind: FIELD_DEFINITION,
        name: buildNameNode(updateAllEntitiesQuery(rootEntityDef.name.value)),
        type: { kind: LIST_TYPE, type: { kind: NON_NULL_TYPE, type: { kind: NAMED_TYPE, name: buildNameNode(rootEntityDef.name.value) }} },
        arguments: [
            // TODO Refactor duplicate code (see AddFilterArgumentsToFieldsTransformer AddOrderbyArgumentsToFieldsTransformer AddPaginationArgumentsToFieldsTransformer)
            buildNamedTypeInputArg(FILTER_ARG, getFilterTypeName(rootEntityDef)),
            buildListTypeInputArg(ORDER_BY_ARG, getOrderByEnumTypeName(rootEntityDef)),
            buildNamedTypeInputArg(FIRST_ARG, GraphQLInt.name),
            buildNonNullTypeInputArg(MUTATION_INPUT_ARG, getUpdateAllInputTypeName(rootEntityDef)),
        ],
        loc: rootEntityDef.loc,
        directives: compact([findDirectiveWithName(rootEntityDef, ROLES_DIRECTIVE), MUTATION_FIELD_DIRECTIVE])
    }
}

function buildDeleteMutation(rootEntityDef: ObjectTypeDefinitionNode): FieldDefinitionNode {
    return {
        kind: FIELD_DEFINITION,
        name: buildNameNode(deleteEntityQuery(rootEntityDef.name.value)),
        type: { kind: NAMED_TYPE, name: buildNameNode(rootEntityDef.name.value) },
        arguments: [
            buildNonNullTypeInputArg(MUTATION_ID_ARG, GraphQLID.name),
        ],
        loc: rootEntityDef.loc,
        directives: compact([findDirectiveWithName(rootEntityDef, ROLES_DIRECTIVE), MUTATION_FIELD_DIRECTIVE])
    }
}

function buildDeleteAllMutation(rootEntityDef: ObjectTypeDefinitionNode): FieldDefinitionNode {
    return {
        kind: FIELD_DEFINITION,
        name: buildNameNode(deleteAllEntitiesQuery(rootEntityDef.name.value)),
        type: { kind: LIST_TYPE, type: { kind: NON_NULL_TYPE, type: { kind: NAMED_TYPE, name: buildNameNode(rootEntityDef.name.value) }} },
        arguments: [
            // TODO Refactor duplicate code (see AddFilterArgumentsToFieldsTransformer AddOrderbyArgumentsToFieldsTransformer AddPaginationArgumentsToFieldsTransformer)
            buildNamedTypeInputArg(FILTER_ARG, getFilterTypeName(rootEntityDef)),
            buildListTypeInputArg(ORDER_BY_ARG, getOrderByEnumTypeName(rootEntityDef)),
            buildNamedTypeInputArg(FIRST_ARG, GraphQLInt.name),
        ],
        loc: rootEntityDef.loc,
        directives: compact([findDirectiveWithName(rootEntityDef, ROLES_DIRECTIVE), MUTATION_FIELD_DIRECTIVE])
    }
}

function buildNonNullTypeInputArg(name: string, namedTypeName: string) {
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

function buildNamedTypeInputArg(name: string, namedTypeName: string) {
    return {
        kind: INPUT_VALUE_DEFINITION,
        name: buildNameNode(name),
        type: {
            kind: NAMED_TYPE,
            name: buildNameNode(namedTypeName)
        }
    };
}

function buildListTypeInputArg(name: string, namedTypeName: string) {
    return {
        kind: INPUT_VALUE_DEFINITION,
        name: buildNameNode(name),
        type: {
            kind: LIST_TYPE,
            type: {
                kind: NON_NULL_TYPE,
                type: {
                    kind: NAMED_TYPE,
                    name: buildNameNode(namedTypeName)
                }
            }
        }
    };
}
