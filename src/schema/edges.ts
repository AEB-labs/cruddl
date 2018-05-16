import { Field, RootEntityType, TypeKind } from '../model';

export enum RelationFieldEdgeSide {
    FROM_SIDE,
    TO_SIDE
}

export function invertRelationFieldEdgeSide(side: RelationFieldEdgeSide) {
    switch (side) {
        case RelationFieldEdgeSide.TO_SIDE:
            return RelationFieldEdgeSide.FROM_SIDE;
        case RelationFieldEdgeSide.FROM_SIDE:
            return RelationFieldEdgeSide.TO_SIDE;
    }
}

// TODO move to model and call Relation
export class EdgeType {
    constructor(params: { fromType: RootEntityType, fromField: Field, toType: RootEntityType, toField?: Field }) {
        this.fromType = params.fromType;
        this.fromField = params.fromField;
        this.toType = params.toType;
        this.toField = params.toField;
    }

    public fromType: RootEntityType;
    public fromField: Field;
    public toType: RootEntityType;
    public toField: Field|undefined;


    public getRelationFieldEdgeSide(field: Field): RelationFieldEdgeSide {
        if (this.fromField == field) {
            return RelationFieldEdgeSide.FROM_SIDE
        } else if (this.toField == field) {
            return RelationFieldEdgeSide.TO_SIDE
        } else {
            throw new Error(`Edge does not include the field ${field.name}`);
        }
    }

    public getFieldOfSide(side: RelationFieldEdgeSide): Field|undefined {
        switch (side) {
            case RelationFieldEdgeSide.FROM_SIDE:
                return this.fromField;
            case RelationFieldEdgeSide.TO_SIDE:
                return this.toField;
        }
    }

    public getTypeOfSide(side: RelationFieldEdgeSide): RootEntityType {
        switch (side) {
            case RelationFieldEdgeSide.FROM_SIDE:
                return this.fromType;
            case RelationFieldEdgeSide.TO_SIDE:
                return this.toType;
        }
    }

    public toString() {
        const fromFieldName = this.fromField ? `.${this.fromField.name}` : '';
        const toFieldName = this.toField ? `.${this.toField.name}` : '';
        return `edge ${this.fromType.name}${fromFieldName}->${this.toType.name}${toFieldName}`;
    }
}

export function getEdgeType(field: Field) {
    if (!field.isRelation) {
        throw new Error(`Expected "${field.declaringType.name}.${field}" to be a relation`);
    }
    if (field.type.kind != TypeKind.ROOT_ENTITY) {
        throw new Error(`Expected "${field.type.name}" to be a root entity, but is ${field.type.kind}`);
    }
    if (field.declaringType.kind != TypeKind.ROOT_ENTITY) {
        throw new Error(`Expected "${field.declaringType.name}" to be a root entity, but is ${field.declaringType.kind}`);
    }

    if (field.inverseOf) {
        // this is the to side
        return new EdgeType({
            fromType: field.type,
            fromField: field.inverseOf,
            toType: field.declaringType,
            toField: field
        });
    } else {
        // this is the from side
        return new EdgeType({
            fromType: field.declaringType,
            fromField: field,
            toType: field.type,
            toField: field.inverseField
        });
    }
}
