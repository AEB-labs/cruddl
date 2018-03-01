import {ASTTransformer} from "../transformation-pipeline";
import {DocumentNode, FieldDefinitionNode, InputValueDefinitionNode, ObjectTypeDefinitionNode} from "graphql";
import {
    buildNameNode,
    createObjectTypeNode,
    findDirectiveWithName,
    getNodeByName,
    getRootEntityTypes,
    getTypeNameIgnoringNonNullAndList,
    enterOrCreateNextNamespacePart
} from "../../schema-utils";
import {
    FIELD_DEFINITION,
    INPUT_VALUE_DEFINITION,
    LIST_TYPE,
    NAMED_TYPE,
    NON_NULL_TYPE,
    STRING
} from "../../../graphql/kinds";
import {mapNullable} from '../../../utils/utils';
import {
    ENTITY_ID,
    KEY_FIELD_DIRECTIVE,
    NAMESPACE_DIRECTIVE,
    NAMESPACE_NAME_ARG,
    NAMESPACE_SEPARATOR,
    QUERY_TYPE,
    ROLES_DIRECTIVE
} from '../../schema-defaults';
import {allEntitiesQueryBy} from "../../../graphql/names";

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
            namespace.split(NAMESPACE_SEPARATOR).forEach(namespacePart => {
                currentNode = enterOrCreateNextNamespacePart(ast, currentNode, namespacePart, QUERY_TYPE);
            });
        }
    }
    currentNode.fields.push(
        buildQueryOneEntityField(rootEntityType),
        buildQueryAllEntityField(rootEntityType),
    )
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