import {ASTTransformer} from "../transformation-pipeline";
import {DocumentNode} from "graphql";
import {
    buildNameNode,
    getNamedTypeDefinitionAST,
    getObjectTypes,
    getTypeNameIgnoringNonNullAndList
} from "../../schema-utils";
import {
    INPUT_VALUE_DEFINITION,
    LIST_TYPE,
    NAMED_TYPE,
    NON_NULL_TYPE,
    OBJECT_TYPE_DEFINITION
} from "../../../graphql/kinds";
import {getOrderByEnumTypeName} from "../../../graphql/names";
import {ORDER_BY_ARG} from "../../schema-defaults";

export class AddOrderbyArgumentsToFieldsTransformer implements ASTTransformer {

    transform(ast: DocumentNode): void {
        getObjectTypes(ast).forEach(objectType => {
            objectType.fields.forEach(field => {
                // Only lists have query args
                if (field.type.kind !== LIST_TYPE && !(field.type.kind === NON_NULL_TYPE && field.type.type.kind === LIST_TYPE)) {
                    return;
                }
                const resolvedType = getNamedTypeDefinitionAST(ast, getTypeNameIgnoringNonNullAndList(field.type));
                // if this field is of an object type and this object type has an *OrderBy type
                if (resolvedType.kind === OBJECT_TYPE_DEFINITION && getNamedTypeDefinitionAST(ast, getOrderByEnumTypeName(resolvedType))) {
                    field.arguments.push({
                        kind: INPUT_VALUE_DEFINITION,
                        name: buildNameNode(ORDER_BY_ARG),
                        type: {
                            kind: LIST_TYPE,
                            type: {
                                kind: NON_NULL_TYPE,
                                type: { kind: NAMED_TYPE, name: buildNameNode(getOrderByEnumTypeName(resolvedType)) }
                            }
                        }
                    })
                }
            })
        })
    }

}