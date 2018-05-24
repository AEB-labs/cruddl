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

    getOtherField(field: Field): Field|undefined {
        const thisSide = this.getFieldSide(field);
        const otherSide = invertRelationFieldSide(thisSide);
        return this.getFieldOfSide(otherSide);
    }

    getMultiplicity(side: RelationFieldSide|Field): Multiplicty {
        let field: Field|undefined;
        if (side instanceof Field) {
            field = side;
        } else {
            field = this.getFieldOfSide(side);
        }
        if (!field) {
            // if no inverse field exists, many-to-* is implicit
            return Multiplicty.MANY;
        }
        return field.isList ? Multiplicty.MANY : Multiplicty.ONE;
    }

    /**
     * Gets the multiplicity of the target field, given the source filed
     */
    getTargetMultiplicity(sourceField: Field): Multiplicty {
        const thisSide = this.getFieldSide(sourceField);
        const otherSide = invertRelationFieldSide(thisSide);
        return this.getMultiplicity(otherSide);
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

    getOtherType(sourceField: Field) {
        return this.getTypeOfSide(invertRelationFieldSide(this.getFieldSide(sourceField)));
    }

    toString() {
        const fromFieldName = this.fromField ? `.${this.fromField.name}` : '';
        const toFieldName = this.toField ? `.${this.toField.name}` : '';
        return `relation ${this.fromType.name}${fromFieldName}->${this.toType.name}${toFieldName}`;
    }
}

export enum Multiplicty {
    ONE,
    MANY
}
