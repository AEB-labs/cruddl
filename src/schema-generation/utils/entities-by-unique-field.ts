import { GraphQLFieldConfigArgumentMap, GraphQLID } from 'graphql';
import { RootEntityType, ScalarType, Type } from '../../model';
import {
    BinaryOperationQueryNode,
    BinaryOperator,
    EntitiesQueryNode,
    LiteralQueryNode,
    TransformListQueryNode,
    VariableQueryNode
} from '../../query-tree';
import { ID_FIELD, REVISION_FIELD } from '../../schema/constants';
import { decapitalize, objectEntries } from '../../utils/utils';
import { createFieldNode } from '../field-nodes';
import { createGraphQLError } from '../graphql-errors';
import { FieldContext } from '../query-node-object-type';

export function getEntitiesByUniqueFieldQuery(
    rootEntityType: RootEntityType,
    args: { [name: string]: any },
    context: FieldContext
) {
    let fieldName: string;
    let value: string;
    if (rootEntityType.keyField && rootEntityType.keyField.name !== ID_FIELD) {
        const id = args[ID_FIELD];
        const key = args[rootEntityType.keyField.name];

        if (id != undefined) {
            if (key != undefined) {
                throw createGraphQLError(
                    `Only one of the arguments "${ID_FIELD}" and "${rootEntityType.keyField.name}" may be specified`,
                    context
                );
            }
            fieldName = ID_FIELD;
            value = id;
        } else {
            if (key == undefined) {
                throw createGraphQLError(
                    `One of the arguments "${ID_FIELD}" and "${rootEntityType.keyField.name}" is required`,
                    context
                );
            }
            fieldName = rootEntityType.keyField.name;
            value = key;
        }
    } else {
        const id = args[ID_FIELD];
        if (id == undefined) {
            throw createGraphQLError(`Argument "${ID_FIELD}" is required`, context);
        }
        fieldName = ID_FIELD;
        value = id;
    }

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
        ...(rootEntityType.keyField
            ? {
                  [rootEntityType.keyField.name]: {
                      type: getAsScalarTypeOrThrow(rootEntityType.keyField.type).graphQLScalarType,
                      description: rootEntityType.keyField.description
                  }
              }
            : {})
    };
}

function getAsScalarTypeOrThrow(type: Type): ScalarType {
    if (!type.isScalarType) {
        throw new Error(`Expected "${type.name}" to be a scalar type, but is ${type.kind}`);
    }
    return type;
}
