import { Field, RelationDeleteAction, RootEntityType } from '../index';

enum RelationFieldSide {
    FROM_SIDE = 'FROM_SIDE',
    TO_SIDE = 'TO_SIDE'
}

function invertRelationFieldSide(side: RelationFieldSide) {
    switch (side) {
        case RelationFieldSide.TO_SIDE:
            return RelationFieldSide.FROM_SIDE;
        case RelationFieldSide.FROM_SIDE:
            return RelationFieldSide.TO_SIDE;
    }
}

/**
 * A view on a relation without taking the perspective of one of the types
 */
export class Relation {
    /**
     * The type declaring the forward relation
     */
    readonly fromType: RootEntityType;
    /**
     * The field declaring the forward relation
     */
    readonly fromField: Field;
    /**
     * The field type of the forward relation, i.e., the type potentially declaring an inverse relation
     */
    readonly toType: RootEntityType;
    /**
     * The field of the toType declaring the inverse relation (if any)
     */
    readonly toField: Field | undefined;

    constructor(params: { fromType: RootEntityType; fromField: Field; toType: RootEntityType; toField?: Field }) {
        this.fromType = params.fromType;
        this.fromField = params.fromField;
        this.toType = params.toType;
        this.toField = params.toField;
    }

    /**
     * Gets relation from the side of the root entity type that declares the forward relation
     */
    get fromSide() {
        return new RelationSide(this, RelationFieldSide.FROM_SIDE);
    }

    /**
     * Gets relation from the side of the root entity type that declares the inverse relation
     */
    get toSide() {
        return new RelationSide(this, RelationFieldSide.TO_SIDE);
    }

    /**
     * Gets a string that uniquely identifies this relation
     */
    get identifier() {
        return `${this.fromType.name}.${this.fromField.name}`;
    }

    toString() {
        const fromFieldName = this.fromField ? `.${this.fromField.name}` : '';
        const toFieldName = this.toField ? `.${this.toField.name}` : '';
        return `relation ${this.fromType.name}${fromFieldName}->${this.toType.name}${toFieldName}`;
    }
}

/**
 * A relation from the perspective of one of the two types
 */
export class RelationSide {
    public readonly sourceType: RootEntityType;
    public readonly sourceField: Field | undefined;
    public readonly targetType: RootEntityType;
    public readonly targetField: Field | undefined;

    constructor(public readonly relation: Relation, private readonly side: RelationFieldSide) {
        switch (side) {
            case RelationFieldSide.FROM_SIDE:
                this.sourceType = relation.fromType;
                this.sourceField = relation.fromField;
                this.targetType = relation.toType;
                this.targetField = relation.toField;
                break;
            default:
                this.sourceType = relation.toType;
                this.sourceField = relation.toField;
                this.targetType = relation.fromType;
                this.targetField = relation.fromField;
        }
    }

    get isFromSide() {
        return this.side === RelationFieldSide.FROM_SIDE;
    }

    get isToSide() {
        return this.side === RelationFieldSide.TO_SIDE;
    }

    get otherSide() {
        return new RelationSide(this.relation, invertRelationFieldSide(this.side));
    }

    // careful, these identifiers are a bit unclear
    /**
     * Is ONE if a source entity can be linked to one target entity, or MANY if it can be linked to many target entities
     */
    get sourceMultiplicity(): Multiplicity {
        if (!this.sourceField) {
            // if no inverse field exists, many-to-* is implicit
            return Multiplicity.MANY;
        }

        return this.sourceField.isList ? Multiplicity.MANY : Multiplicity.ONE;
    }

    /**
     * Is ONE if a target entity can be linked to one source entity, or MANY if it can be linked to many source entities
     */
    get targetMultiplicity(): Multiplicity {
        return this.otherSide.sourceMultiplicity;
    }

    /**
     * Specifies the action to take regarding this relation if the source entity is to be removed
     */
    get deleteAction(): RelationDeleteAction {
        // inverse relations can't specify onDelete, so they're always REMOVE_EDGES
        if (this.isToSide) {
            return RelationDeleteAction.REMOVE_EDGES;
        }
        return this.relation.fromField.relationDeleteAction;
    }

    getSourceFieldOrThrow(): Field {
        if (!this.sourceField) {
            throw new Error(`Expected ${this.toString()} to have a source field`);
        }
        return this.sourceField;
    }

    toString() {
        const fromFieldName = this.relation.fromField ? `.${this.relation.fromField.name}` : '';
        const toFieldName = this.relation.toField ? `.${this.relation.toField.name}` : '';
        return `relation ${this.relation.fromType.name}${fromFieldName}${this.isFromSide ? '->' : '<-'}${
            this.relation.toType.name
        }${toFieldName}`;
    }
}

export enum Multiplicity {
    ONE = 'ONE',
    MANY = 'MANY'
}
