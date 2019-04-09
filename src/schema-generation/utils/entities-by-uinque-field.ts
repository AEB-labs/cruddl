import { GraphQLFieldConfigArgumentMap, GraphQLID } from 'graphql';
import { RootEntityType, ScalarType, Type } from '../../model';
import {
    BinaryOperationQueryNode, BinaryOperator, EntitiesQueryNode, LiteralQueryNode, TransformListQueryNode,
    VariableQueryNode
} from '../../query-tree';
import { ID_FIELD } from '../../schema/constants';
import { decapitalize, objectEntries } from '../../utils/utils';
import { createFieldNode } from '../field-nodes';

export function getEntitiesByUniqueFieldQuery(rootEntityType: RootEntityType, args: {[name:string]: any}) {
    const entityVarNode = new VariableQueryNode(decapitalize(rootEntityType.name));
    const filterClauses = objectEntries(args).map(([fieldName, value]) =>
        new BinaryOperationQueryNode(createFieldNode(rootEntityType.getFieldOrThrow(fieldName), entityVarNode), BinaryOperator.EQUAL, new LiteralQueryNode(value)));
    if (filterClauses.length != 1) {
        throw new Error(`Must specify exactly one argument to field "${rootEntityType.name}"`); // TODO throw this at the correct GraphQL query location
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
            type: GraphQLID,
            description: rootEntityType.getFieldOrThrow('id').description
        },
        ...(
            rootEntityType.keyField ? {
                [rootEntityType.keyField.name]: {
                    type: getAsScalarTypeOrThrow(rootEntityType.keyField.type).graphQLScalarType,
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
