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
    // theoretically, we could make the id field non-null if there is no key field. However, this would be a breaking
    // change for everyone that specifies the id field as (non-null) variable - which are probably quite a lot of
    // consumers. It wouldn't be consistent anyway (would not work if a key field exists)
    // Throwing if `null` is actually passed to `id` is breaking as well, but only if there is an error anyway, so
    // that's probably a lot less critical.

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
