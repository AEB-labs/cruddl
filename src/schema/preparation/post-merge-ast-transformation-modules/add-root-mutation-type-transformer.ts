import {ASTTransformer} from "../transformation-pipeline";
import {DocumentNode, FieldDefinitionNode, GraphQLID, ObjectTypeDefinitionNode} from "graphql";
import {
    buildNameNode,
    createObjectTypeNode,
    findDirectiveWithName,
    getNodeByName,
    getRootEntityTypes,
    walkNamespacePathByOneHop
} from "../../schema-utils";
import {FIELD_DEFINITION, INPUT_VALUE_DEFINITION, NAMED_TYPE, NON_NULL_TYPE, STRING} from "graphql/language/kinds";
import {mapNullable} from '../../../utils/utils';
import {
    MUTATION_ID_ARG,
    MUTATION_INPUT_ARG,
    MUTATION_TYPE,
    NAMESPACE_DIRECTIVE,
    NAMESPACE_NAME_ARG,
    NAMESPACE_SEPARATOR,
    ROLES_DIRECTIVE
} from '../../schema-defaults';
import {
    createEntityQuery,
    deleteEntityQuery,
    getCreateInputTypeName,
    getUpdateInputTypeName,
    updateEntityQuery
} from "../../../graphql/names";

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
            namespace.split(NAMESPACE_SEPARATOR).forEach(hop => {
                currentNode = walkNamespacePathByOneHop(ast, currentNode, hop, MUTATION_TYPE);
            });
        }
    }
    currentNode.fields.push(
        buildCreateMutation(rootEntityType),
        buildUpdateMutation(rootEntityType),
        buildDeleteMutation(rootEntityType)
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
        directives: mapNullable(rootEntityDef.directives, directives => directives.filter(dir => dir.name.value == ROLES_DIRECTIVE))
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
        directives: mapNullable(rootEntityDef.directives, directives => directives.filter(dir => dir.name.value == ROLES_DIRECTIVE))
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
        directives: mapNullable(rootEntityDef.directives, directives => directives.filter(dir => dir.name.value == ROLES_DIRECTIVE))
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
