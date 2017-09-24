import {ASTTransformer} from "../ast-transformer";
import {DocumentNode} from "graphql";
import {
    buildNameNode,
    getNamedInputTypeDefinitionAST,
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
} from "graphql/language/kinds";
import {getFilterTypeName} from "../../../graphql/names";
import {FILTER_ARG} from "../../schema-defaults";

export class AddFilterArgumentsToFieldsTransformer implements ASTTransformer {

    transform(ast: DocumentNode): void {
        getObjectTypes(ast).forEach(objectType => {
            objectType.fields.forEach(field => {
                // Only lists have query args
                if (field.type.kind !== LIST_TYPE && !(field.type.kind === NON_NULL_TYPE && field.type.type.kind === LIST_TYPE)) {
                    return;
                }
                const resolvedType = getNamedTypeDefinitionAST(ast, getTypeNameIgnoringNonNullAndList(ast, field.type));
                // if this field is of an object type and this object type has a *Filter type
                if (resolvedType.kind === OBJECT_TYPE_DEFINITION && getNamedInputTypeDefinitionAST(ast, getFilterTypeName(resolvedType))) {
                    field.arguments.push({
                        kind: INPUT_VALUE_DEFINITION,
                        name: buildNameNode(FILTER_ARG),
                        type: { kind: NAMED_TYPE,  name: buildNameNode(getFilterTypeName(resolvedType))}
                    })
                }
            })
        })
    }

}