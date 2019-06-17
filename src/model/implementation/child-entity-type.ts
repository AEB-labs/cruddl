import { ID_FIELD } from '../../schema/constants';
import { Field, SystemFieldConfig } from './field';
import { ObjectTypeBase } from './object-type-base';
import { ChildEntityTypeConfig, FieldConfig, TypeKind } from '../config';
import { Model } from './model';

export class ChildEntityType extends ObjectTypeBase {
    constructor(input: ChildEntityTypeConfig, model: Model) {
        super(input, model, systemFieldInputs);
    }

    /**
     * Gets a field that is guaranteed to be unique, to be used for absolute order
     */
    get discriminatorField(): Field {
        return this.getFieldOrThrow(ID_FIELD);
    }

    readonly kind: TypeKind.CHILD_ENTITY = TypeKind.CHILD_ENTITY;
    readonly isChildEntityType: true = true;
    readonly isRootEntityType: false = false;
    readonly isEntityExtensionType: false = false;
    readonly isValueObjectType: false = false;
}

const systemFieldInputs: ReadonlyArray<SystemFieldConfig> = [
    {
        name: 'id',
        typeName: 'ID',
        isNonNull: true,
        description: 'An auto-generated string that identifies this child entity uniquely within this collection of child entities'
    }, {
        name: 'createdAt',
        typeName: 'DateTime',
        isNonNull: true,
        description: 'The instant this object has been created'
    }, {
        name: 'updatedAt',
        typeName: 'DateTime',
        isNonNull: true,
        description: 'The instant this object has been updated the last time'
    }
];
