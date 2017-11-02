import {ASTTransformer} from "../transformation-pipeline";
import {DocumentNode, TypeNode} from "graphql";
import {LIST_TYPE, NAMED_TYPE, NON_NULL_TYPE} from "graphql/language/kinds";
import {getFieldDefinitionNodes, nonNullifyType} from "../../schema-utils";

/**
 * Asserts that all Lists used in FieldDefinitions are of Type [Obj!]!
 */
export class NonNullableListsTransformer implements ASTTransformer {

    transform(ast: DocumentNode): void {
        getFieldDefinitionNodes(ast).forEach(field => field.type = this.nonNullifyListType(field.type));
    }

    /**
     * Deep search on the FieldDefinitionTree for
     * @param {TypeNode} parentType
     * @param {TypeNode} type
     * @returns {TypeNode}
     */
    protected nonNullifyListType(type: TypeNode): TypeNode {
        switch (type.kind) {
            case NAMED_TYPE:
                return type;
            case LIST_TYPE:
                return nonNullifyType({ ...type, type: nonNullifyType(type.type)})
            case NON_NULL_TYPE:
                if (type.type.kind === LIST_TYPE) {
                    return { ...type, type: { ...type.type, type: nonNullifyType(type.type.type)} }
                } else {
                    return type;
                }
        }
    }
}
