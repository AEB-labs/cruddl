import {ASTTransformer} from "../transformation-pipeline";
import {DocumentNode, FieldDefinitionNode, InputValueDefinitionNode, ObjectTypeDefinitionNode} from "graphql";
import {
    buildNameNode, findDirectiveWithName, getNodeByName, getObjectTypes, getRootEntityTypes,
    getTypeNameIgnoringNonNullAndList,
    hasDirectiveWithName
} from "../../schema-utils";
import {
    DIRECTIVE_DEFINITION,
    FIELD_DEFINITION,
    INPUT_VALUE_DEFINITION,
    LIST_TYPE,
    NAMED_TYPE,
    NON_NULL_TYPE, OBJECT,
    OBJECT_TYPE_DEFINITION, STRING, DIRECTIVE
} from "graphql/language/kinds";
import {flatMap, mapNullable} from '../../../utils/utils';
import {
    ENTITY_ID, KEY_FIELD_DIRECTIVE, NAMESPACE_DIRECTIVE, NAMESPACE_FIELD_PATH_DIRECTIVE, NAMESPACE_NAME_ARG, NAMESPACE_SEPARATOR,
    QUERY_TYPE,
    ROLES_DIRECTIVE
} from '../../schema-defaults';
import {allEntitiesQueryBy} from "../../../graphql/names";
import {createEntityObjectNode} from "../../../query/queries";

export class AddRootQueryTypeTransformer implements ASTTransformer {

    transform(ast: DocumentNode): void {
        const rootQueryField = createObjectTypeNode(QUERY_TYPE);
        ast.definitions.push(rootQueryField);
        getRootEntityTypes(ast).forEach(rootEntityType => buildQueryTypeEntityFieldsIntoNamespace(ast, rootEntityType, rootQueryField))
    }
}

function buildQueryTypeEntityFieldsIntoNamespace(ast: DocumentNode, rootEntityType: ObjectTypeDefinitionNode, rootQueryField: ObjectTypeDefinitionNode) {
    let currentNode = rootQueryField;
    const namespaceDirective = findDirectiveWithName(rootEntityType, NAMESPACE_DIRECTIVE);
    if (namespaceDirective && namespaceDirective.arguments) {
        const nameArg = getNodeByName(namespaceDirective.arguments, NAMESPACE_NAME_ARG);
        if (nameArg && nameArg.value.kind === STRING && nameArg.value.value) {
            const namespace = nameArg.value.value;
            // loop through namespaces and create intermediate fields and types
            namespace.split(NAMESPACE_SEPARATOR).forEach(hop => {
                currentNode = walkNamespacePathByOneHop(ast, currentNode, hop);
            });
        }
    }
    currentNode.fields.push(
        buildQueryOneEntityField(rootEntityType),
        buildQueryAllEntityField(rootEntityType),
    )
}

/**
 * walks one hop along the namespace path. Creates missing fields and types and returns the current node.
 *
 * @param ast
 * @param {ObjectTypeDefinitionNode} currentNode - the starting node
 * @param {string} hop - one step of the namespace to walk
 * @returns {ObjectTypeDefinitionNode}
 */
function walkNamespacePathByOneHop(ast: DocumentNode, currentNode: ObjectTypeDefinitionNode, hop: string): ObjectTypeDefinitionNode {
    let hopField = getNodeByName(currentNode.fields, hop);
    if (hopField) {
        // Hey, were done, this one already exists. Just search and return the corresponding type.
        const arrivingNode = getNodeByName(getObjectTypes(ast), hop);
        if (!arrivingNode) {
            throw Error(`Found path field ${hop} but not corresponding type. That seems a bit strange...`);
        }
        return arrivingNode;
    } else {
        const arrivingNode = createObjectTypeNode(hop);
        ast.definitions.push(arrivingNode);
        currentNode.fields.push(createHopField(hop));
        return arrivingNode;
    }
}

function createObjectTypeNode(name: string): ObjectTypeDefinitionNode {
    return {
        kind: OBJECT_TYPE_DEFINITION,
        name: buildNameNode(name),
        fields: []
    }
}

function createHopField(name: string): FieldDefinitionNode {
    return {
        kind: FIELD_DEFINITION,
        name: buildNameNode(name),
        type: {
            kind: NAMED_TYPE,
            name: buildNameNode(name),
        },
        arguments: [],
        directives: [
            {
                kind: DIRECTIVE,
                name: buildNameNode(NAMESPACE_FIELD_PATH_DIRECTIVE),
                arguments: []
            }
        ]
    }
}

function buildQueryOneEntityField(entityDef: ObjectTypeDefinitionNode): FieldDefinitionNode {
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
            ...buildQueryOneInputFiltersForKeyFields(entityDef)
        ],
        loc: entityDef.loc,
        directives: mapNullable(entityDef.directives, directives => directives.filter(dir => dir.name.value == ROLES_DIRECTIVE))
    }
}

function buildQueryAllEntityField(entityDef: ObjectTypeDefinitionNode): FieldDefinitionNode {
    return {
        kind: FIELD_DEFINITION,
        name: buildNameNode(allEntitiesQueryBy(entityDef.name.value)),
        type: { kind: LIST_TYPE, type: { kind: NON_NULL_TYPE, type: { kind: NAMED_TYPE, name: buildNameNode(entityDef.name.value) }} },
        arguments: [], // arguments will be added later
        loc: entityDef.loc,
        directives: mapNullable(entityDef.directives, directives => directives.filter(dir => dir.name.value == ROLES_DIRECTIVE))
    }
}

function buildQueryOneInputFiltersForKeyFields(entityDef: ObjectTypeDefinitionNode): InputValueDefinitionNode[] {
    const keyFields = entityDef.fields.filter(field => field.directives && field.directives.some(directive => directive.name.value === KEY_FIELD_DIRECTIVE));
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