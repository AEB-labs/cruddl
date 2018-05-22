import { Field, Relation, RelationFieldSide, RootEntityType } from '../model';
import { QueryNode } from './base';
import { blue } from 'colors/safe';

export class EntityFromIdQueryNode extends QueryNode {
    constructor(public readonly rootEntityType: RootEntityType, public readonly idNode: QueryNode) {
        super();
    }

    public describe() {
        return `${blue(this.rootEntityType.name)} with id (${this.idNode.describe()})`;
    }
}

/**
 * A node that evaluates in the list of entities of a given type. use ListQueryNode to further process them
 */
export class EntitiesQueryNode extends QueryNode {
    constructor(public readonly rootEntityType: RootEntityType) {
        super();
    }

    describe() {
        return `entities of type ${blue(this.rootEntityType.name)}`;
    }
}


/**
 * A node that evaluates to the value of a field of an object
 *
 * Note: this is unrelated to storing the value in a property of a result object, see ObjectQueryNode
 *
 * Runtime implementation note: if objectNode yields a non-object value (e.g. NULL), the result should be NULL.
 * (this is Arango logic and we currently rely on it in createScalarFieldPathValueNode()
 */
export class FieldQueryNode extends QueryNode {
    constructor(public readonly objectNode: QueryNode, public readonly field: Field) {
        super();
    }

    public describe() {
        return `${this.objectNode.describe()}.${blue(this.field.name)}`;
    }
}

/**
 * A node that evaluates to the id of a root entity
 */
export class RootEntityIDQueryNode extends QueryNode {
    constructor(public readonly objectNode: QueryNode) {
        super();
    }

    public describe() {
        return `id(${this.objectNode.describe()})`;
    }
}

/**
 * Evaluates to all root entitites that are connected to a specific root entitity through a specific edge
 */
export class FollowEdgeQueryNode extends QueryNode {
    constructor(readonly relation: Relation, readonly sourceEntityNode: QueryNode, readonly sourceFieldSide: RelationFieldSide) {
        super();
    }

    describe() {
        switch (this.sourceFieldSide) {
            case RelationFieldSide.FROM_SIDE:
                return `follow forward ${blue(this.relation.toString())} of ${this.sourceEntityNode.describe()}`;
            case RelationFieldSide.TO_SIDE:
                return `follow backward ${blue(this.relation.toString())} of ${this.sourceEntityNode.describe()}`;
        }
    }
}
