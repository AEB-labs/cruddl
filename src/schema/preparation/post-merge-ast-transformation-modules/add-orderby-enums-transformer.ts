import {ASTTransformer} from '../transformation-pipeline';
import {
    DirectiveNode,
    DocumentNode,
    EnumTypeDefinitionNode,
    EnumValueDefinitionNode,
    ObjectTypeDefinitionNode
} from 'graphql';
import {
    areRolesDirectivesEqual,
    buildNameNode,
    findDirectiveWithName, getAllowedReadRoles,
    getNamedTypeDefinitionAST,
    getObjectTypes,
    getTypeNameIgnoringNonNullAndList
} from '../../schema-utils';
import {compact, flatMap} from '../../../utils/utils';
import {
    ENUM_TYPE_DEFINITION,
    ENUM_VALUE_DEFINITION,
    LIST_TYPE,
    NON_NULL_TYPE,
    OBJECT_TYPE_DEFINITION,
    SCALAR_TYPE_DEFINITION
} from 'graphql/language/kinds';
import {getOrderByEnumTypeName, sortedByAsc, sortedByDesc} from '../../../graphql/names';
import {ROLES_DIRECTIVE} from '../../schema-defaults';
import {intersectRolesDirectives} from './add-input-type-transformation-helper-transformer';

interface EnumValueWithDirectives {
    name: string;
    directives: DirectiveNode[]
}

export class AddOrderbyInputEnumsTransformer implements ASTTransformer {

    transform(ast: DocumentNode): void {
        getObjectTypes(ast).forEach(objectType => {
            ast.definitions.push(this.createOrderByEnum(ast, objectType))
        })
    }

    protected createOrderByEnum(ast: DocumentNode, objectType: ObjectTypeDefinitionNode): EnumTypeDefinitionNode {
        return {
            name: buildNameNode(getOrderByEnumTypeName(objectType)),
            kind: ENUM_TYPE_DEFINITION,
            loc: objectType.loc,
            values: flatMap(this.collectOrderByEnumFieldNamesRecurse(ast, objectType, [], ""), ({name, directives}) =>
                [
                    this.buildEnumValueDefinitionNode(sortedByAsc(name), directives),
                    this.buildEnumValueDefinitionNode(sortedByDesc(name), directives)
                ]
            )
        }
    }

    protected buildEnumValueDefinitionNode(name: string, directives?: DirectiveNode[]): EnumValueDefinitionNode {
        return {
            kind: ENUM_VALUE_DEFINITION,
            name: buildNameNode(name),
            directives
        }
    }

    protected collectOrderByEnumFieldNamesRecurse(ast: DocumentNode, objectType: ObjectTypeDefinitionNode, ignoreTypeNames: string[], prefix: string, outerRoleDirective?: DirectiveNode): EnumValueWithDirectives[] {
        // see of the outerRoleDirective really restricts something
        // this is to work around bug https://gitlab.aeb.com/next-playground/momo/issues/26
        const objectTypeRoles = findDirectiveWithName(objectType, ROLES_DIRECTIVE);
        if (outerRoleDirective && (!objectTypeRoles || areRolesDirectivesEqual(outerRoleDirective, objectTypeRoles))) {
            outerRoleDirective = undefined;
        }

        return flatMap(objectType.fields, field => {
            // no sorting on nested lists
            if (field.type.kind === LIST_TYPE || field.type.kind === NON_NULL_TYPE && field.type.type.kind === LIST_TYPE) {
                // emtpy list will be auto-removed by flatMap
                return []
            }
            // prevent endless recursion by cycling through one-to-one relationships
            const typeName = getTypeNameIgnoringNonNullAndList(field.type);
            if (ignoreTypeNames.includes(typeName)) {
                return []
            }
            const type = getNamedTypeDefinitionAST(ast, typeName);

            let roleDirectives = [ findDirectiveWithName(field, ROLES_DIRECTIVE), outerRoleDirective ];

            switch (type.kind) {
                case SCALAR_TYPE_DEFINITION:
                case ENUM_TYPE_DEFINITION:
                    const roleDirective = intersectRolesDirectives(compact(roleDirectives));
                    return [ { name: prefix + field.name.value, directives: roleDirective ? [ roleDirective ] : [] } ];
                case OBJECT_TYPE_DEFINITION:
                    roleDirectives.push(findDirectiveWithName(type, ROLES_DIRECTIVE));
                    return this.collectOrderByEnumFieldNamesRecurse(ast, type, [...ignoreTypeNames, typeName], prefix + field.name.value + '_', intersectRolesDirectives(compact(roleDirectives)));
                default:
                    throw new Error(`Unexpected type of ${typeName} when creating order by enum.`);
            }
        })
    }

}