import { GraphQLID, GraphQLInputType, GraphQLList, GraphQLNonNull } from 'graphql';
import {
    getAddChildEntitiesFieldName, getRemoveChildEntitiesFieldName, getUpdateChildEntitiesFieldName
} from '../../schema/names';
import { CalcMutationsOperator, Field } from '../../model';
import {
    BinaryOperationQueryNode, BinaryOperator, FieldQueryNode, LiteralQueryNode, MergeObjectsQueryNode, NullQueryNode,
    ObjectQueryNode, QueryNode, SetFieldQueryNode
} from '../../query-tree';
import { AnyValue, PlainObject } from '../../utils/utils';
import { CreateChildEntityInputType, CreateObjectInputType } from '../create-input-types';
import { createFieldNode } from '../field-nodes';
import { TypedInputFieldBase } from '../typed-input-object-type';
import { UpdateChildEntityInputType, UpdateEntityExtensionInputType, UpdateObjectInputType } from './input-types';

export interface UpdateInputField extends TypedInputFieldBase<UpdateInputField> {
    readonly field: Field

    getProperties(value: AnyValue, currentEntityNode: QueryNode): ReadonlyArray<SetFieldQueryNode>;

    collectAffectedFields(value: AnyValue, fields: Set<Field>): void;

    appliesToMissingFields(): boolean;
}

export class UpdateFilterInputField implements UpdateInputField {
    readonly name: string;
    readonly description: string;

    constructor(public readonly field: Field, public readonly inputType: GraphQLInputType) {
        this.name = this.field.name;
        this.description = `The \`${this.field.name}\` of the \`${field.declaringType.name}\` to be updated (does not change the \`${this.field.name}\`).`;
    }

    appliesToMissingFields() {
        return false;
    }

    getProperties() {
        return [];
    }

    collectAffectedFields() {
        // this field is not updated, so don't put it in here - it will occur as regular read access, though.
        return [];
    }
}

export class BasicUpdateInputField implements UpdateInputField {

    constructor(
        public readonly field: Field,
        public readonly inputType: GraphQLInputType | UpdateObjectInputType,
        public readonly name = field.name,
        public readonly description = field.description,
        public readonly deprecationReason?: string
    ) {
    }

    getProperties(value: AnyValue, currentEntityNode: QueryNode): ReadonlyArray<SetFieldQueryNode> {
        value = this.coerceValue(value);

        return [
            new SetFieldQueryNode(this.field, new LiteralQueryNode(value))
        ];
    }

    protected coerceValue(value: AnyValue): AnyValue {
        return value;
    }

    collectAffectedFields(value: AnyValue, fields: Set<Field>) {
        fields.add(this.field);
    }

    appliesToMissingFields() {
        return false;
    }
}

export class BasicListUpdateInputField extends BasicUpdateInputField {
    protected coerceValue(value: AnyValue): AnyValue {
        value = super.coerceValue(value);
        if (value === null) {
            // null is not a valid list value - if the user specified it, coerce it to [] to not have a mix of [] and
            // null in the database
            return [];
        }
        return value;
    }
}

export class CalcMutationInputField extends BasicUpdateInputField {
    constructor(field: Field, inputType: GraphQLInputType, public readonly operator: CalcMutationsOperator, private readonly prefix: string) {
        super(field, inputType, prefix + field.name);
    }

    getProperties(value: AnyValue, currentEntityNode: QueryNode): ReadonlyArray<SetFieldQueryNode> {
        const currentValueNode = createFieldNode(this.field, currentEntityNode);
        value = this.coerceValue(value);

        return [
            new SetFieldQueryNode(this.field, this.getValueNode(currentValueNode, new LiteralQueryNode(value)))
        ];
    }

    private getValueNode(currentNode: QueryNode, operandNode: QueryNode): QueryNode {
        return new BinaryOperationQueryNode(currentNode, BinaryOperator[this.operator], operandNode);
    }
}

export class UpdateValueObjectInputField extends BasicUpdateInputField {
    constructor(
        field: Field,
        public readonly objectInputType: CreateObjectInputType
    ) {
        super(field, objectInputType.getInputType());
    }

    protected coerceValue(value: AnyValue): AnyValue {
        value = super.coerceValue(value);
        if (value == undefined) {
            return value;
        }
        return this.objectInputType.prepareValue(value);
    }

    collectAffectedFields(value: AnyValue, fields: Set<Field>) {
        super.collectAffectedFields(value, fields);
        if (value == undefined) {
            return;
        }

        this.objectInputType.collectAffectedFields(value, fields);
    }
}

export class UpdateValueObjectListInputField extends BasicUpdateInputField {
    constructor(
        field: Field,
        public readonly objectInputType: CreateObjectInputType
    ) {
        super(field, new GraphQLList(new GraphQLNonNull(objectInputType.getInputType())));
    }

    protected coerceValue(value: AnyValue): AnyValue {
        value = super.coerceValue(value);
        if (value === null) {
            // null is not a valid list value - if the user specified it, coerce it to [] to not have a mix of [] and
            // null in the database
            return [];
        }
        if (value === undefined) {
            return undefined;
        }
        if (!Array.isArray(value)) {
            throw new Error(`Expected value for "${this.name}" to be an array, but is "${typeof value}"`);
        }
        return value.map(value => this.objectInputType.prepareValue(value));
    }

    collectAffectedFields(value: AnyValue, fields: Set<Field>) {
        super.collectAffectedFields(value, fields);
        if (value == undefined) {
            return;
        }
        if (!Array.isArray(value)) {
            throw new Error(`Expected value for "${this.name}" to be an array, but is "${typeof value}"`);
        }

        value.forEach(value => this.objectInputType.collectAffectedFields(value, fields));
    }
}

export class UpdateEntityExtensionInputField implements UpdateInputField {
    readonly name: string;
    readonly description: string|undefined;
    readonly inputType: GraphQLInputType;

    constructor(
        public readonly field: Field,
        public readonly objectInputType: UpdateEntityExtensionInputType
    ) {
        this.name = field.name;
        this.description = (field.description ? field.description + '\n\n' : '') +
            'This field is an entity extension and thus is never \'null\' - passing \'null\' here does not change the field value.';
        this.inputType = objectInputType.getInputType();
    }

    getProperties(value: AnyValue, currentEntityNode: QueryNode) {
        // setting to null is the same as setting to {} - does not change anything (entity extensions can't be null)
        if (value == null || Object.keys(value).length === 0) {
            return [];
        }

        return [
            new SetFieldQueryNode(this.field, this.getValueNode(value, currentEntityNode))
        ];
    }

    private getValueNode(value: PlainObject, currentEntityNode: QueryNode) {
        // this function wraps the field in a conditional node to fall back to {} on null values
        // it also unwraps the given node if it is a conditional node because (null).field == null
        const currentValueNode = createFieldNode(this.field, currentEntityNode);

        return new MergeObjectsQueryNode([
            currentValueNode,
            new ObjectQueryNode(this.objectInputType.getProperties(value, currentValueNode))
        ]);
    }

    appliesToMissingFields() {
        return false;
    }

    collectAffectedFields(value: AnyValue, fields: Set<Field>) {
        fields.add(this.field);
        if (value != undefined) {
            this.objectInputType.collectAffectedFields(value, fields);
        }
    }
}

export abstract class AbstractChildEntityInputField implements UpdateInputField {
    readonly description: string;

    protected constructor(
        public readonly field: Field,
        public readonly name: string,
        description: string
    ) {
        this.description = description + (this.field.description ? '\n\n' + this.field.description : '');
    }

    abstract readonly inputType: GraphQLInputType;

    appliesToMissingFields() {
        return false;
    }

    getProperties() {
        // the fields can't be set like this because multiple input fields affect the same child entity list
        // instead, this property is computed in UpdateObjectInputType.getChildEntityProperties().
        return [];
    }

    collectAffectedFields(value: AnyValue, fields: Set<Field>) {
        fields.add(this.field);
    }
}

export class AddChildEntitiesInputField extends AbstractChildEntityInputField {
    public readonly inputType: GraphQLInputType;

    constructor(
        field: Field,
        public readonly createInputType: CreateChildEntityInputType
    ) {
        super(field, getAddChildEntitiesFieldName(field.name),
            `Adds new \`${field.type.pluralName}\` to the list of \`${field.name}\``);
        this.inputType = new GraphQLList(new GraphQLNonNull(createInputType.getInputType()));
    }

    collectAffectedFields(value: AnyValue, fields: Set<Field>) {
        super.collectAffectedFields(value, fields);
        if (value != undefined) {
            this.createInputType.collectAffectedFields(value, fields);
        }
    }
}

export class UpdateChildEntitiesInputField extends AbstractChildEntityInputField {
    public readonly inputType: GraphQLInputType;

    constructor(
        field: Field,
        public readonly updateInputType: UpdateChildEntityInputType
    ) {
        super(field, getUpdateChildEntitiesFieldName(field.name),
            `Updates \`${field.type.pluralName}\` in the list of \`${field.name}\``);
        this.inputType = new GraphQLList(new GraphQLNonNull(updateInputType.getInputType()));
    }

    collectAffectedFields(value: AnyValue, fields: Set<Field>) {
        super.collectAffectedFields(value, fields);
        if (value != undefined) {
            this.updateInputType.collectAffectedFields(value, fields);
        }
    }
}

export class RemoveChildEntitiesInputField extends AbstractChildEntityInputField {
    public readonly inputType: GraphQLInputType;

    constructor(
        field: Field
    ) {
        super(field, getRemoveChildEntitiesFieldName(field.name),
            `Deletes \`${field.type.pluralName}\` by ids in the list of \`${field.name}\``);
        this.inputType = new GraphQLList(new GraphQLNonNull(GraphQLID));
    }
}
