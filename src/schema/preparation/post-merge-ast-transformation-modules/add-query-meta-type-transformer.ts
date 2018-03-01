import {ASTTransformer} from "../transformation-pipeline";
import {DocumentNode, GraphQLInt} from "graphql";
import {FIELD_DEFINITION, NAMED_TYPE, NON_NULL_TYPE, OBJECT_TYPE_DEFINITION} from "../../../graphql/kinds";
import {buildNameNode} from "../../schema-utils";
import {COUNT_META_FIELD, QUERY_META_TYPE} from "../../schema-defaults";

export class AddQueryMetaTypeTransformer implements ASTTransformer {

    transform(ast: DocumentNode): void {
        ast.definitions.push({
            kind: OBJECT_TYPE_DEFINITION,
            name: buildNameNode(QUERY_META_TYPE),
            fields: [
                {
                    kind: FIELD_DEFINITION,
                    name: buildNameNode(COUNT_META_FIELD),
                    arguments: [],
                    type: { kind: NON_NULL_TYPE, type: { kind: NAMED_TYPE, name: buildNameNode(GraphQLInt.name) }},
                }
            ]
        })
    }

}