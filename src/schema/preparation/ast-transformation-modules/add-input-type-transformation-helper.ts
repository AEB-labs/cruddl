import {INPUT_VALUE_DEFINITION, LIST_TYPE, NAMED_TYPE, NON_NULL_TYPE} from "graphql/language/kinds";
import {buildNameNode} from "../../schema-utils";
import {GraphQLID, InputValueDefinitionNode, Location} from "graphql";
import {ID_FIELD} from "../../schema-defaults";

export function buildInputValueNode(name: string, namedTypeName: string, loc?: Location): InputValueDefinitionNode {
    return {
        kind: INPUT_VALUE_DEFINITION,
        type: {
            kind: NAMED_TYPE,
            name: buildNameNode(namedTypeName)
        },
        name: buildNameNode(name),
        loc: loc
    }
}

export function buildInputValueListNode(name: string, namedTypeName: string, loc?: Location): InputValueDefinitionNode {
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
        loc: loc,
    }
}

export function buildInputValueNodeID(): InputValueDefinitionNode {
    return {
        kind: INPUT_VALUE_DEFINITION,
        type: {
            kind: NON_NULL_TYPE,
            type: {
                kind: NAMED_TYPE,
                name: buildNameNode(GraphQLID.name)
            },
        },
        name: buildNameNode(ID_FIELD),
    }
}
