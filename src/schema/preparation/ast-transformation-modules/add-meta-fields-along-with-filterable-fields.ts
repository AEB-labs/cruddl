import {ASTTransformer} from "../ast-transformer";
import {DocumentNode, FieldDefinitionNode} from "graphql";
import {buildNameNode, getObjectTypes} from "../../schema-utils";
import {FILTER_ARG, QUERY_META_TYPE} from "../../schema-defaults";
import {getMetaNameFieldFor} from "../../../graphql/names";
import {FIELD_DEFINITION, NAMED_TYPE, NON_NULL_TYPE} from "graphql/language/kinds";

export class AddMetaFieldsAlongWithFilterableFieldsTransformer implements ASTTransformer {

    transform(ast: DocumentNode): void {
        getObjectTypes(ast).forEach(objectType => {
            objectType.fields.forEach(field => {
                if (field.arguments.some(arg => arg.name.value === FILTER_ARG)) {
                    objectType.fields.push(this.buildMetaField(field))
                }
            })
        })
    }

    protected buildMetaField(field: FieldDefinitionNode): FieldDefinitionNode {
        return {
            name: buildNameNode(getMetaNameFieldFor(field.name.value)),
            arguments: [...field.arguments],
            type: { kind: NON_NULL_TYPE, type: { kind: NAMED_TYPE, name: buildNameNode(QUERY_META_TYPE)}},
            kind: FIELD_DEFINITION,
            loc: field.loc
        }
    }
}