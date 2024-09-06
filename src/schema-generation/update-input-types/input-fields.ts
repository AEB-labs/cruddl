import { GraphQLID, GraphQLInputType, GraphQLList, GraphQLNonNull } from 'graphql';
import { ZonedDateTime } from '@js-joda/core';
import { CalcMutationsOperator, Field } from '../../model';
import {
    BinaryOperationQueryNode,
    BinaryOperator,
    LiteralQueryNode,
    MergeObjectsQueryNode,
    ObjectQueryNode,
    QueryNode,
    SetFieldQueryNode,
    UnaryOperationQueryNode,
    UnaryOperator,
} from '../../query-tree';
import {
    getAddChildEntitiesFieldName,
    getRemoveChildEntitiesFieldName,
    getReplaceChildEntitiesFieldName,
    getUpdateChildEntitiesFieldName,
} from '../../schema/names';
import { GraphQLOffsetDateTime, serializeForStorage } from '../../schema/scalars/offset-date-time';
import { AnyValue, isReadonlyArray, PlainObject } from '../../utils/utils';
import { CreateChildEntityInputType, CreateObjectInputType } from '../create-input-types';
import { createFieldNode } from '../field-nodes';
import { FieldContext } from '../query-node-object-type';
import { TypedInputFieldBase, TypedInputObjectType } from '../typed-input-object-type';
import {
    UpdateChildEntityInputType,
    UpdateEntityExtensionInputType,
    UpdateObjectInputType,
} from './input-types';

export interface UpdateInputFieldContext extends FieldContext {
    currentEntityNode: QueryNode;
}

export interface UpdateInputField extends TypedInputFieldBase<UpdateInputField> {
    readonly field: Field;

    getProperties(
        value: AnyValue,
        context: UpdateInputFieldContext,
    ): ReadonlyArray<SetFieldQueryNode>;

    collectAffectedFields(value: AnyValue, fields: Set<Field>, context: FieldContext): void;

    appliesToMissingFields(): boolean;
}
export class DummyUpdateInputField implements UpdateInputField {
    readonly deprecationReason: string | undefined;

    constructor(
        readonly field: Field,
        readonly name: string,
        readonly inputType: GraphQLInputType | TypedInputObjectType<UpdateInputField>,
        opts: {
            readonly deprecationReason?: string;
        } = {},
    ) {
        this.deprecationReason = opts.deprecationReason;
    }

    appliesToMissingFields(): boolean {
        return false;
    }

    collectAffectedFields(value: AnyValue, fields: Set<Field>, context: FieldContext): void {}

    getProperties(
        value: AnyValue,
        context: UpdateInputFieldContext,
    ): ReadonlyArray<SetFieldQueryNode> {
        return [];
    }
}

export class UpdateFilterInputField implements UpdateInputField {
    readonly name: string;
    readonly description: string;

    constructor(
        public readonly field: Field,
        public readonly inputType: GraphQLInputType,
    ) {
        this.name = this.field.name;
        this.description = `The \`${this.field.name}\` of the \`${field.declaringType.name}\` to be updated (does not change the \`${this.field.name}\`).`;
    }

    appliesToMissingFields() {
        return false;
    }

    getProperties(context: FieldContext) {
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
        public readonly deprecationReason?: string,
    ) {}

    getProperties(value: AnyValue, context: FieldContext): ReadonlyArray<SetFieldQueryNode> {
        value = this.coerceValue(value, context);

        return [new SetFieldQueryNode(this.field, new LiteralQueryNode(value))];
    }

    protected coerceValue(value: AnyValue, context: FieldContext): AnyValue {
        if (
            this.field.type.isScalarType &&
            this.field.type.graphQLScalarType === GraphQLOffsetDateTime &&
            value instanceof ZonedDateTime
        ) {
            return serializeForStorage(value);
        }
        return value;
    }

    collectAffectedFields(value: AnyValue, fields: Set<Field>, context: FieldContext) {
        fields.add(this.field);
    }

    appliesToMissingFields() {
        return false;
    }
}

export class BasicListUpdateInputField extends BasicUpdateInputField {
    protected coerceValue(value: AnyValue, context: FieldContext): AnyValue {
        // null is not a valid list value - if the user specified it, coerce it to [] to not have a mix of [] and
        // null in the database
        let listValue = isReadonlyArray(value) ? value : [];
        return listValue.map((itemValue) => super.coerceValue(itemValue, context));
    }
}

export class CalcMutationInputField extends BasicUpdateInputField {
    constructor(
        field: Field,
        inputType: GraphQLInputType,
        public readonly operator: CalcMutationsOperator,
        private readonly prefix: string,
    ) {
        super(field, inputType, prefix + field.name);
    }

    getProperties(
        value: AnyValue,
        context: UpdateInputFieldContext,
    ): ReadonlyArray<SetFieldQueryNode> {
        const currentValueNode = createFieldNode(this.field, context.currentEntityNode);
        value = this.coerceValue(value, context);

        return [
            new SetFieldQueryNode(
                this.field,
                this.getValueNode(currentValueNode, new LiteralQueryNode(value)),
            ),
        ];
    }

    private getValueNode(currentNode: QueryNode, operandNode: QueryNode): QueryNode {
        const rawValue = new BinaryOperationQueryNode(
            currentNode,
            BinaryOperator[this.operator],
            operandNode,
        );
        if (this.field.type.isScalarType && this.field.type.fixedPointDecimalInfo) {
            const factor = new LiteralQueryNode(10 ** this.field.type.fixedPointDecimalInfo.digits);
            return new BinaryOperationQueryNode(
                new UnaryOperationQueryNode(
                    new BinaryOperationQueryNode(rawValue, BinaryOperator.MULTIPLY, factor),
                    UnaryOperator.ROUND,
                ),
                BinaryOperator.DIVIDE,
                factor,
            );
        }
        return rawValue;
    }
}

export class UpdateValueObjectInputField extends BasicUpdateInputField {
    constructor(
        field: Field,
        public readonly objectInputType: CreateObjectInputType,
    ) {
        super(field, objectInputType.getInputType());
    }

    protected coerceValue(value: AnyValue, context: FieldContext): AnyValue {
        value = super.coerceValue(value, context);
        if (value == undefined) {
            return value;
        }
        return this.objectInputType.prepareValue(value as PlainObject, context);
    }

    collectAffectedFields(value: AnyValue, fields: Set<Field>, context: FieldContext) {
        super.collectAffectedFields(value, fields, context);
        if (value == undefined) {
            return;
        }

        this.objectInputType.collectAffectedFields(value as PlainObject, fields, context);
    }
}

export class UpdateValueObjectListInputField extends BasicUpdateInputField {
    constructor(
        field: Field,
        public readonly objectInputType: CreateObjectInputType,
    ) {
        super(field, new GraphQLList(new GraphQLNonNull(objectInputType.getInputType())));
    }

    protected coerceValue(value: AnyValue, context: FieldContext): AnyValue {
        value = super.coerceValue(value, context);
        if (value === null) {
            // null is not a valid list value - if the user specified it, coerce it to [] to not have a mix of [] and
            // null in the database
            return [];
        }
        if (value === undefined) {
            return undefined;
        }
        if (!isReadonlyArray(value)) {
            throw new Error(
                `Expected value for "${this.name}" to be an array, but is "${typeof value}"`,
            );
        }
        return value.map((value) =>
            this.objectInputType.prepareValue(value as PlainObject, context),
        );
    }

    collectAffectedFields(value: AnyValue, fields: Set<Field>, context: FieldContext) {
        super.collectAffectedFields(value, fields, context);
        if (value == undefined) {
            return;
        }
        if (!isReadonlyArray(value)) {
            throw new Error(
                `Expected value for "${this.name}" to be an array, but is "${typeof value}"`,
            );
        }

        value.forEach((value) =>
            this.objectInputType.collectAffectedFields(value as PlainObject, fields, context),
        );
    }
}

export class UpdateEntityExtensionInputField implements UpdateInputField {
    readonly name: string;
    readonly description: string | undefined;
    readonly inputType: GraphQLInputType;

    constructor(
        public readonly field: Field,
        public readonly objectInputType: UpdateEntityExtensionInputType,
    ) {
        this.name = field.name;
        this.description =
            (field.description ? field.description + '\n\n' : '') +
            "This field is an entity extension and thus is never 'null' - passing 'null' here does not change the field value.";
        this.inputType = objectInputType.getInputType();
    }

    getProperties(value: AnyValue, context: UpdateInputFieldContext) {
        // setting to null is the same as setting to {} - does not change anything (entity extensions can't be null)
        if (value == null || Object.keys(value as object).length === 0) {
            return [];
        }

        return [
            new SetFieldQueryNode(this.field, this.getValueNode(value as PlainObject, context)),
        ];
    }

    private getValueNode(value: PlainObject, context: UpdateInputFieldContext) {
        // this function wraps the field in a conditional node to fall back to {} on null values
        // it also unwraps the given node if it is a conditional node because (null).field == null
        const currentValueNode = createFieldNode(this.field, context.currentEntityNode);

        return new MergeObjectsQueryNode([
            currentValueNode,
            new ObjectQueryNode(
                this.objectInputType.getProperties(value, {
                    ...context,
                    currentEntityNode: currentValueNode,
                }),
            ),
        ]);
    }

    appliesToMissingFields() {
        return false;
    }

    collectAffectedFields(value: AnyValue, fields: Set<Field>, context: UpdateInputFieldContext) {
        fields.add(this.field);
        if (value != undefined) {
            this.objectInputType.collectAffectedFields(value as PlainObject, fields, context);
        }
    }
}

export abstract class AbstractChildEntityInputField implements UpdateInputField {
    readonly description: string;

    protected constructor(
        public readonly field: Field,
        public readonly name: string,
        description: string,
    ) {
        this.description =
            description + (this.field.description ? '\n\n' + this.field.description : '');
    }

    abstract readonly inputType: GraphQLInputType;

    appliesToMissingFields() {
        return false;
    }

    getProperties(context: FieldContext) {
        // the fields can't be set like this because multiple input fields affect the same child entity list
        // instead, this property is computed in UpdateObjectInputType.getChildEntityProperties().
        return [];
    }

    collectAffectedFields(value: AnyValue, fields: Set<Field>, context: FieldContext) {
        fields.add(this.field);
    }
}

export class ReplaceChildEntitiesInputField extends AbstractChildEntityInputField {
    public readonly inputType: GraphQLInputType;

    constructor(
        field: Field,
        public readonly createInputType: CreateChildEntityInputType,
    ) {
        super(
            field,
            getReplaceChildEntitiesFieldName(field.name),
            `Deletes all \`${field.type.pluralName}\` objects in list of \`${field.name}\` and replaces it with the specified objects.\n\nCannot be combined with the add/update/delete fields for the same child entity list.`,
        );
        this.inputType = new GraphQLList(new GraphQLNonNull(createInputType.getInputType()));
    }

    collectAffectedFields(value: AnyValue, fields: Set<Field>, context: FieldContext) {
        super.collectAffectedFields(value, fields, context);
        if (value != undefined) {
            this.createInputType.collectAffectedFields(value as PlainObject, fields, context);
        }
    }
}

export class AddChildEntitiesInputField extends AbstractChildEntityInputField {
    public readonly inputType: GraphQLInputType;

    constructor(
        field: Field,
        public readonly createInputType: CreateChildEntityInputType,
    ) {
        super(
            field,
            getAddChildEntitiesFieldName(field.name),
            `Adds new \`${field.type.pluralName}\` to the list of \`${field.name}\``,
        );
        this.inputType = new GraphQLList(new GraphQLNonNull(createInputType.getInputType()));
    }

    collectAffectedFields(value: AnyValue, fields: Set<Field>, context: FieldContext) {
        super.collectAffectedFields(value, fields, context);
        if (value != undefined) {
            this.createInputType.collectAffectedFields(value as PlainObject, fields, context);
        }
    }
}

export class UpdateChildEntitiesInputField extends AbstractChildEntityInputField {
    public readonly inputType: GraphQLInputType;

    constructor(
        field: Field,
        public readonly updateInputType: UpdateChildEntityInputType,
    ) {
        super(
            field,
            getUpdateChildEntitiesFieldName(field.name),
            `Updates \`${field.type.pluralName}\` in the list of \`${field.name}\``,
        );
        this.inputType = new GraphQLList(new GraphQLNonNull(updateInputType.getInputType()));
    }

    collectAffectedFields(value: AnyValue, fields: Set<Field>, context: FieldContext) {
        super.collectAffectedFields(value, fields, context);
        if (value != undefined) {
            this.updateInputType.collectAffectedFields(value as PlainObject, fields, context);
        }
    }
}

export class RemoveChildEntitiesInputField extends AbstractChildEntityInputField {
    public readonly inputType: GraphQLInputType;

    constructor(field: Field) {
        super(
            field,
            getRemoveChildEntitiesFieldName(field.name),
            `Deletes \`${field.type.pluralName}\` by ids in the list of \`${field.name}\``,
        );
        this.inputType = new GraphQLList(new GraphQLNonNull(GraphQLID));
    }
}
