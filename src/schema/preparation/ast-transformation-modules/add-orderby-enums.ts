import {ASTTransformer} from "../ast-transformer";
import {DocumentNode, EnumTypeDefinitionNode, EnumValueDefinitionNode, ObjectTypeDefinitionNode} from "graphql";
import {
    buildNameNode, getNamedTypeDefinitionAST, getObjectTypes,
    getTypeNameIgnoringNonNullAndList
} from "../../schema-utils";
import {flatMap} from "../../../utils/utils";
import {
    ENUM_TYPE_DEFINITION, ENUM_VALUE_DEFINITION, LIST_TYPE, NON_NULL_TYPE, OBJECT_TYPE_DEFINITION,
    SCALAR_TYPE_DEFINITION
} from "graphql/language/kinds";
import {getOrderByEnumTypeName, sortedByAsc, sortedByDesc} from "../../../graphql/names";

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
            values: flatMap(this.collectOrderByEnumFieldNamesRecurse(ast, objectType, [], ""), sortableFieldName =>
                [
                    this.buildEnumValueDefinitionNode(sortedByAsc(sortableFieldName)),
                    this.buildEnumValueDefinitionNode(sortedByDesc(sortableFieldName))
                ]
            )
        }
    }

    protected buildEnumValueDefinitionNode(name: string): EnumValueDefinitionNode {
        return {
            kind: ENUM_VALUE_DEFINITION,
            name: buildNameNode(name)
        }
    }

    protected collectOrderByEnumFieldNamesRecurse(ast: DocumentNode, objectType: ObjectTypeDefinitionNode, ignoreTypeNames: string[], prefix: string): string[] {
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
            switch (type.kind) {
                case SCALAR_TYPE_DEFINITION:
                case ENUM_TYPE_DEFINITION:
                    return [prefix + field.name.value];
                case OBJECT_TYPE_DEFINITION:
                    return this.collectOrderByEnumFieldNamesRecurse(ast, type, [...ignoreTypeNames, typeName], prefix + field.name.value + '_');
                default:
                    throw new Error(`Unexpected type of ${typeName} when creating order by enum.`);
            }
        })
    }

}