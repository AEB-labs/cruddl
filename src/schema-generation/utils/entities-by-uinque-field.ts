import { GraphQLFieldConfigArgumentMap, GraphQLID } from 'graphql';
import { ScalarType, Type } from '../../model';
import { RootEntityType } from '../../model/implementation';
import {
    BinaryOperationQueryNode, BinaryOperator, EntitiesQueryNode, LiteralQueryNode, TransformListQueryNode,
    VariableQueryNode
} from '../../query-tree';
import { createScalarFieldValueNode } from '../../query/fields';
import { ID_FIELD } from '../../schema/schema-defaults';
import { decapitalize, objectEntries } from '../../utils/utils';

export function getEntitiesByUniqueFieldQuery(rootEntityType: RootEntityType, args: {[name:string]: any}) {
    const entityVarNode = new VariableQueryNode(decapitalize(rootEntityType.name));
    const filterClauses = objectEntries(args).map(([fieldName, value]) =>
        new BinaryOperationQueryNode(createScalarFieldValueNode(rootEntityType, fieldName, entityVarNode), BinaryOperator.EQUAL, new LiteralQueryNode(value)));
    if (filterClauses.length != 1) {
        throw new Error(`Must specify exactly one argument to ${rootEntityType.toString()}`); // TODO throw this at the correct GraphQL query location
    }
    const filterNode = filterClauses[0];
    const listNode = new EntitiesQueryNode(rootEntityType);
    return new TransformListQueryNode({
        listNode,
        filterNode,
        maxCount: 1,
        itemVariable: entityVarNode
    });
}

export function getArgumentsForUniqueFields(rootEntityType: RootEntityType): GraphQLFieldConfigArgumentMap {
    return {
        [ID_FIELD]: {
            type: GraphQLID
        },
        ...(
            rootEntityType.keyField ? {
                [rootEntityType.keyField.name]: {
                    type: getAsScalarTypeOrThrow(rootEntityType.keyField.type).graphQLScalarType
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
