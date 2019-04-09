import { GraphQLFieldConfigArgumentMap, GraphQLID, GraphQLInputType, GraphQLNonNull } from 'graphql';
import { RootEntityType, ScalarType, Type } from '../../model';
import {
    BinaryOperationQueryNode, BinaryOperator, EntitiesQueryNode, ListQueryNode, LiteralQueryNode, TransformListQueryNode,
    VariableQueryNode
} from '../../query-tree';
import { ID_FIELD } from '../../schema/constants';
import { decapitalize, objectEntries } from '../../utils/utils';
import { createFieldNode } from '../field-nodes';

export function getEntitiesByUniqueFieldQuery(rootEntityType: RootEntityType, args: {[name:string]: any}) {
    const nonNullArgs = objectEntries(args).filter(([key, value]) => value);
    if (nonNullArgs.length !== 1) {
        throw new Error(`Must specify exactly one non-null argument to field "${rootEntityType.name}"`); // TODO throw this at the correct GraphQL query location
    }
    const [fieldName, value] = nonNullArgs[0];

    const entityVarNode = new VariableQueryNode(decapitalize(rootEntityType.name));
    const fieldNode = createFieldNode(rootEntityType.getFieldOrThrow(fieldName), entityVarNode);
    const filterNode = new BinaryOperationQueryNode(fieldNode, BinaryOperator.EQUAL, new LiteralQueryNode(value));
    const listNode = new EntitiesQueryNode(rootEntityType);

    return new TransformListQueryNode({
        listNode,
        filterNode,
        maxCount: 1,
        itemVariable: entityVarNode
    });
}

export function getArgumentsForUniqueFields(rootEntityType: RootEntityType): GraphQLFieldConfigArgumentMap {
    function maybeDecorateType(type: GraphQLInputType): GraphQLInputType {
        // if there is only one field, we can show the non-nullability in the schema
        if (!rootEntityType.keyField) {
            return new GraphQLNonNull(type);
        }
        return type;
    }

    return {
        [ID_FIELD]: {
            type: maybeDecorateType(GraphQLID),
            description: rootEntityType.getFieldOrThrow('id').description
        },
        ...(
            rootEntityType.keyField ? {
                [rootEntityType.keyField.name]: {
                    type: maybeDecorateType(getAsScalarTypeOrThrow(rootEntityType.keyField.type).graphQLScalarType),
                    description: rootEntityType.keyField.description
                }
            } : {}
        )
    };
}

function getAsScalarTypeOrThrow(type: Type): ScalarType {
    if (!type.isScalarType) {
        throw new Error(`Expected "${type.name}" to be a scalar type, but is ${type.kind}`);
    }
    return type;
}
