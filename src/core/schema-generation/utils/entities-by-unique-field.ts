import type { RootEntityType } from '../../model/implementation/root-entity-type.js';
import { TransformListQueryNode } from '../../query-tree/lists.js';
import { LiteralQueryNode } from '../../query-tree/literals.js';
import { BinaryOperationQueryNode, BinaryOperator } from '../../query-tree/operators.js';
import { EntitiesQueryNode } from '../../query-tree/queries.js';
import { VariableQueryNode } from '../../query-tree/variables.js';
import { ID_FIELD } from '../../schema/constants.js';
import { decapitalize, isDefined } from '../../utils/utils.js';
import { createFieldNode } from '../field-nodes.js';
import { createGraphQLError } from '../graphql-errors.js';
import type { FieldContext } from '../query-node-object-type/context.js';

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
