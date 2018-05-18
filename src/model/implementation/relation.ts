import { Field, RootEntityType } from '../index';

export enum RelationFieldSide {
    FROM_SIDE,
    TO_SIDE
}

export function invertRelationFieldSide(side: RelationFieldSide) {
    switch (side) {
        case RelationFieldSide.TO_SIDE:
            return RelationFieldSide.FROM_SIDE;
        case RelationFieldSide.FROM_SIDE:
            return RelationFieldSide.TO_SIDE;
    }
}

export class Relation {
    constructor(params: { fromType: RootEntityType, fromField: Field, toType: RootEntityType, toField?: Field }) {
        this.fromType = params.fromType;
        this.fromField = params.fromField;
        this.toType = params.toType;
        this.toField = params.toField;
    }

    readonly fromType: RootEntityType;
    readonly fromField: Field;
    readonly toType: RootEntityType;
    readonly toField: Field|undefined;

    getFieldSide(field: Field): RelationFieldSide {
        if (this.fromField == field) {
            return RelationFieldSide.FROM_SIDE
        } else if (this.toField == field) {
            return RelationFieldSide.TO_SIDE
        } else {
            throw new Error(`Edge does not include the field ${field.name}`);
        }
    }

    getFieldOfSide(side: RelationFieldSide): Field|undefined {
        switch (side) {
            case RelationFieldSide.FROM_SIDE:
                return this.fromField;
            case RelationFieldSide.TO_SIDE:
                return this.toField;
        }
    }

    getTypeOfSide(side: RelationFieldSide): RootEntityType {
        switch (side) {
            case RelationFieldSide.FROM_SIDE:
                return this.fromType;
            case RelationFieldSide.TO_SIDE:
                return this.toType;
        }
    }

    toString() {
        const fromFieldName = this.fromField ? `.${this.fromField.name}` : '';
        const toFieldName = this.toField ? `.${this.toField.name}` : '';
        return `edge ${this.fromType.name}${fromFieldName}->${this.toType.name}${toFieldName}`;
    }
}
