import {ASTTransformer} from "../transformation-pipeline";
import {DocumentNode, FieldDefinitionNode} from "graphql";
import {buildNameNode, getObjectTypes} from "../../schema-utils";
import {FILTER_ARG, QUERY_META_TYPE, ROLES_DIRECTIVE} from '../../schema-defaults';
import {getMetaNameFieldFor} from "../../../graphql/names";
import {FIELD_DEFINITION, NAMED_TYPE, NON_NULL_TYPE} from "../../../graphql/kinds";
import {mapNullable} from '../../../utils/utils';

export class AddMetaFieldsAlongWithFilterableFieldsTransformer implements ASTTransformer {

    transform(ast: DocumentNode): void {
        getObjectTypes(ast).forEach(objectType => {
            objectType.fields.forEach(field => {
                if (field.arguments.some(arg => arg.name.value === FILTER_ARG)) {
                    objectType.fields.push(buildMetaField(field))
                }
            })
        })
    }

}

function buildMetaField(field: FieldDefinitionNode): FieldDefinitionNode {
    return {
        name: buildNameNode(getMetaNameFieldFor(field.name.value)),
        // meta fields have only the filter arg of the original field.
        arguments: field.arguments.filter(arg => arg.name.value === FILTER_ARG),
        type: { kind: NON_NULL_TYPE, type: { kind: NAMED_TYPE, name: buildNameNode(QUERY_META_TYPE)}},
        kind: FIELD_DEFINITION,
        loc: field.loc,
        directives: mapNullable(field.directives, directives => directives.filter(dir => dir.name.value == ROLES_DIRECTIVE))
    }
}
