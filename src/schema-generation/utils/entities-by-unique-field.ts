import { RootEntityType } from '../../model/index.js';
import {
    BinaryOperationQueryNode,
    BinaryOperator,
    EntitiesQueryNode,
    LiteralQueryNode,
    TransformListQueryNode,
    VariableQueryNode,
} from '../../query-tree/index.js';
import { ID_FIELD } from '../../schema/constants.js';
import { decapitalize, isDefined } from '../../utils/utils.js';
import { createFieldNode } from '../field-nodes.js';
import { createGraphQLError } from '../graphql-errors.js';
import { FieldContext } from '../query-node-object-type/index.js';

export function getEntitiesByUniqueFieldQuery(
    rootEntityType: RootEntityType,
    args: { [name: string]: any },
    context: FieldContext,
) {
    let fieldName: string;
    let value: string;
    if (rootEntityType.keyField && rootEntityType.keyField.name !== ID_FIELD) {
        const id = args[ID_FIELD];
        const key = args[rootEntityType.keyField.name];

        if (isDefined(id)) {
            if (isDefined(key)) {
                throw createGraphQLError(
                    `Only one of the arguments "${ID_FIELD}" and "${rootEntityType.keyField.name}" may be specified`,
                    context,
                );
            }
            fieldName = ID_FIELD;
            value = id;
        } else {
            if (!isDefined(key)) {
                throw createGraphQLError(
                    `One of the arguments "${ID_FIELD}" and "${rootEntityType.keyField.name}" is required`,
                    context,
                );
            }
            fieldName = rootEntityType.keyField.name;
            value = key;
        }
    } else {
        const id = args[ID_FIELD];
        if (!isDefined(id)) {
            throw createGraphQLError(`Argument "${ID_FIELD}" is required`, context);
        }
        fieldName = ID_FIELD;
        value = id;
    }

    const entityVarNode = new VariableQueryNode(decapitalize(rootEntityType.name));
    const fieldNode = createFieldNode(rootEntityType.getFieldOrThrow(fieldName), entityVarNode);
    const filterNode = new BinaryOperationQueryNode(
        fieldNode,
        BinaryOperator.EQUAL,
        new LiteralQueryNode(value),
    );
    const listNode = new EntitiesQueryNode(rootEntityType);

    return new TransformListQueryNode({
        listNode,
        filterNode,
        maxCount: 1,
        itemVariable: entityVarNode,
    });
}
