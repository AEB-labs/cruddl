import {
    INPUT_VALUE_DEFINITION,
    LIST_TYPE,
    NAMED_TYPE,
    NON_NULL_TYPE,
    OBJECT_TYPE_DEFINITION
} from 'graphql/language/kinds';
import {
    buildNameNode,
    findDirectiveWithName, getCalcMutationOperatorsFromDirective,
    getNamedTypeDefinitionAST,
    getReferenceKeyField,
    getRoleListFromDirective,
    hasDirectiveWithName
} from '../../schema-utils';
import {
    ArgumentNode,
    DirectiveNode,
    DocumentNode,
    FieldDefinitionNode,
    GraphQLID,
    InputValueDefinitionNode,
    ListValueNode,
    Location,
    NamedTypeNode,
    StringValueNode
} from 'graphql';
import {
    CALC_MUTATIONS_DIRECTIVE,
    ID_FIELD,
    REFERENCE_DIRECTIVE,
    RELATION_DIRECTIVE,
    ROLES_DIRECTIVE,
    ROLES_READ_ARG,
    ROLES_READ_WRITE_ARG
} from '../../schema-defaults';
import {compact} from '../../../utils/utils';
import {getInputTypeName} from '../../../graphql/names';
import {intersection} from 'lodash';

export function buildInputValueNode(name: string, namedTypeName: string, loc?: Location, directives?: DirectiveNode[]): InputValueDefinitionNode {
    return {
        kind: INPUT_VALUE_DEFINITION,
        type: {
            kind: NAMED_TYPE,
            name: buildNameNode(namedTypeName)
        },
        name: buildNameNode(name),
        loc: loc,
        directives
    };
}

export function buildInputValueNodeFromField(name: string, namedTypeName: string, sourceField: FieldDefinitionNode): InputValueDefinitionNode {
    const directiveNames = [ROLES_DIRECTIVE];
    const directives = compact(directiveNames.map(name => findDirectiveWithName(sourceField, name)));
    return buildInputValueNode(name, namedTypeName, sourceField.loc, directives.length ? directives : undefined);
}

export function buildInputValueListNode(name: string, namedTypeName: string, loc?: Location, directives?: DirectiveNode[]): InputValueDefinitionNode {
    return {
        kind: INPUT_VALUE_DEFINITION,
        type: {
            kind: LIST_TYPE,
            type: {
                kind: NON_NULL_TYPE,
                type: {
                    kind: NAMED_TYPE,
                    name: buildNameNode(namedTypeName)
                }
            }
        },
        name: buildNameNode(name),
        loc: loc
    };
}

export function buildInputValueListNodeFromField(name: string, namedTypeName: string, sourceField: FieldDefinitionNode): InputValueDefinitionNode {
    const directiveNames = [ROLES_DIRECTIVE];
    const directives = compact(directiveNames.map(name => findDirectiveWithName(sourceField, name)));
    return buildInputValueListNode(name, namedTypeName, sourceField.loc, directives.length ? directives : undefined);
}

export function buildInputValueNodeID(): InputValueDefinitionNode {
    return {
        kind: INPUT_VALUE_DEFINITION,
        type: {
            kind: NON_NULL_TYPE,
            type: {
                kind: NAMED_TYPE,
                name: buildNameNode(GraphQLID.name)
            }
        },
        name: buildNameNode(ID_FIELD)
    };
}

/**
 * Creates a new @roles() directive which is equivalent to a list of directive nodes combined
 * (getting more and more restrictive)
 */
export function intersectRolesDirectives(directiveNodes: DirectiveNode[]): DirectiveNode|undefined {
    if (!directiveNodes.length) {
        // no restriction
        return undefined;
    }

    function getArg(argName: string): ArgumentNode {
        const roleSets = directiveNodes.map(directive => getRoleListFromDirective(directive, argName));
        const roles = intersection(...roleSets);
        const argValue: ListValueNode = {
            kind: 'ListValue',
            values: roles.map((roleName: string): StringValueNode => ({
                kind: 'StringValue',
                value: roleName
            }))
        };
        return {
            kind: 'Argument',
            name: { kind: 'Name', value: argName },
            value: argValue
        };
    }

    return {
        kind: 'Directive',
        name: { kind: 'Name', value: ROLES_DIRECTIVE },
        arguments: [
            getArg(ROLES_READ_ARG),
            getArg(ROLES_READ_WRITE_ARG)
        ]
    };
}

export function buildInputFieldFromNonListField(ast: DocumentNode, field: FieldDefinitionNode, namedType: NamedTypeNode ) {
    const typeDefinition = getNamedTypeDefinitionAST(ast, namedType.name.value);
    if (typeDefinition.kind === OBJECT_TYPE_DEFINITION) {
        if (hasDirectiveWithName(field, REFERENCE_DIRECTIVE)) {
            const keyType = getReferenceKeyField(typeDefinition);
            return buildInputValueNodeFromField(field.name.value, keyType, field);
        }
        if (hasDirectiveWithName(field, RELATION_DIRECTIVE)) {
            return buildInputValueNodeFromField(field.name.value, GraphQLID.name, field);
        }

        // we excluded lists, relations and references -> no child entities, no root entities
        // -> only extensions and value objects -> we don't need to distinguish between create and update
        return buildInputValueNodeFromField(field.name.value, getInputTypeName(typeDefinition), field);
    } else {
        // scalars
        return buildInputValueNodeFromField(field.name.value, namedType.name.value, field);
    }
}

export function buildInputFieldsFromCalcMutationField(ast: DocumentNode, field: FieldDefinitionNode, namedType: NamedTypeNode ): InputValueDefinitionNode[] {
    const directive = findDirectiveWithName(field, CALC_MUTATIONS_DIRECTIVE);
    if (!directive) {
        // directive missing => no calcMutations
        return [];
    }
    const operators = getCalcMutationOperatorsFromDirective(directive);

    return operators.map(operator => buildInputValueNodeFromField(operator.prefix + field.name.value, namedType.name.value, field))
}