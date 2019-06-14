import { ID_FIELD } from '../../schema/constants';
import { Field } from './field';
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

const systemFieldInputs: FieldConfig[] = [
    {
        name: 'id',
        typeName: 'ID',
        description: 'An auto-generated string that identifies this child entity uniquely within this collection of child entities',
        isQuickSearchIndexed: true,
        isQuickSearchFulltextIndexed: false,
        isIncludedInSearch: false
    }, {
        name: 'createdAt',
        typeName: 'DateTime',
        description: 'The instant this object has been created',
        isQuickSearchIndexed: true,
        isQuickSearchFulltextIndexed: false,
        isIncludedInSearch: false
    }, {
        name: 'updatedAt',
        typeName: 'DateTime',
        description: 'The instant this object has been updated the last time',
        isQuickSearchIndexed: true,
        isQuickSearchFulltextIndexed: false,
        isIncludedInSearch: false
    }
];
