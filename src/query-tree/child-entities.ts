import { QueryNode } from './base';
import { VariableQueryNode } from './variables';
import { indent } from '../utils/utils';

export interface UpdateChildEntitiesQueryNodeParams {
    /**
     * The original list of child entities
     */
    readonly originalList: QueryNode;

    /**
     * A variable to use as a dictionary for existing child entities
     *
     * This variable will be set to an object like { id1: childEntity1, id2: childEntity2 }. The
     * updateQueryNode can use a DynamicPropertyAccessQueryNode(dictionaryVar, id) to access the old
     * child entity
     */
    readonly dictionaryVar: VariableQueryNode;

    /**
     * The list of child entity updates
     *
     * A PropertyAccessQueryNode(dictionaryVar, id) can be used to access the old value for the
     * respective DynamicPropertyAccessQueryNode entity
     */
    readonly updates: ReadonlyArray<ChildEntityUpdate>;
}

export interface ChildEntityUpdate {
    /**
     * A node that evaluates to the child entity id
     */
    readonly idNode: QueryNode;

    /**
     * A node that evaluates to the new value of the child entity
     */
    readonly newChildEntityNode: QueryNode;
}

/**
 * Updates multiple objects in a list, each identified by an "id" field
 */
export class UpdateChildEntitiesQueryNode extends QueryNode {
    /**
     * The original list of child entities
     */
    readonly originalList: QueryNode;

    /**
     * A variable to use as a dictionary for existing child entities
     *
     * This variable will be set to an object like { id1: childEntity1, id2: childEntity2 }. The
     * updateQueryNode can use a DynamicPropertyAccessQueryNode(dictionaryVar, id) to access the old
     * child entity
     */
    readonly dictionaryVar: VariableQueryNode;

    /**
     * The list of child entity updates
     *
     * A PropertyAccessQueryNode(dictionaryVar, id) can be used to access the old value for the
     * respective DynamicPropertyAccessQueryNode entity
     */
    readonly updates: ReadonlyArray<ChildEntityUpdate>;

    constructor(params: UpdateChildEntitiesQueryNodeParams) {
        super();
        this.originalList = params.originalList;
        this.dictionaryVar = params.dictionaryVar;
        this.updates = params.updates;
    }

    describe() {
        return (
            `update child entity list (\n` +
            indent(this.originalList.describe()) +
            '\n)' +
            `with the following updates:\n` +
            indent(
                this.updates
                    .map(
                        (update) =>
                            `${update.idNode.describe()}: ${update.newChildEntityNode.describe()}`,
                    )
                    .join('\n'),
            )
        );
    }
}
