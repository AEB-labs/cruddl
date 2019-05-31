import { blue } from '../utils/colors';
import { Field, RelationSide, RootEntityType } from '../model';
import { QueryNode } from './base';

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
 * A node that evaluates to the value of a field of an object, or NULL if it does not exist or objectNode does not
 * evaluate to an object
 *
 * Note: this is unrelated to storing the value in a property of a result object, see ObjectQueryNode
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
 * A node that evaluates to the value of a field of an object, or NULL if it does not exist or objectNode does not
 * evaluate to an object
 *
 * Note: this is unrelated to storing the value in a property of a result object, see ObjectQueryNode
 */
export class FieldPathQueryNode extends QueryNode {
    constructor(public readonly objectNode: QueryNode, public readonly path: ReadonlyArray<Field>) {
        super();
    }

    public describe() {
        return `${this.objectNode.describe()}.${blue(this.path.map(value => value.name).join("."))}`;
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
 * Evaluates to all root entities that are connected to a specific root entitity through a specific edge
 */
export class FollowEdgeQueryNode extends QueryNode {
    constructor(readonly relationSide: RelationSide, readonly sourceEntityNode: QueryNode) {
        super();
    }

    describe() {
        const dir = this.relationSide.isFromSide ? 'forward' : 'backward';
        return `follow ${dir} ${blue(this.relationSide.relation.toString())} of ${this.sourceEntityNode.describe()}`;
    }
}
