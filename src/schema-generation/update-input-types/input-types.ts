import { GraphQLID, GraphQLInputFieldConfigMap, Thunk } from 'graphql';
import { groupBy } from 'lodash';
import { ChildEntityType, EntityExtensionType, Field, ObjectType, RootEntityType } from '../../model';
import {
    BinaryOperationQueryNode,
    BinaryOperator,
    ConcatListsQueryNode,
    ConditionalQueryNode,
    FieldQueryNode,
    LiteralQueryNode,
    MergeObjectsQueryNode,
    ObjectQueryNode,
    PreExecQueryParms,
    QueryNode,
    RuntimeErrorQueryNode,
    SafeListQueryNode,
    SetFieldQueryNode,
    TransformListQueryNode,
    UnaryOperationQueryNode,
    UnaryOperator,
    VariableQueryNode
} from '../../query-tree';
import { ENTITY_UPDATED_AT, ID_FIELD, REVISION_FIELD } from '../../schema/constants';
import {
    getAddChildEntitiesFieldName,
    getRemoveChildEntitiesFieldName,
    getUpdateChildEntitiesFieldName
} from '../../schema/names';
import { AnyValue, decapitalize, flatMap, joinWithAnd, objectEntries, PlainObject } from '../../utils/utils';
import { createGraphQLError } from '../graphql-errors';
import { FieldContext } from '../query-node-object-type';
import { TypedInputObjectType } from '../typed-input-object-type';
import {
    AddChildEntitiesInputField,
    UpdateChildEntitiesInputField,
    UpdateInputField,
    UpdateInputFieldContext
} from './input-fields';
import { isRelationUpdateField } from './relation-fields';

function getCurrentISODate() {
    return new Date().toISOString();
}

export interface AdditionalPropertiesContext extends UpdateInputFieldContext {
    regularProperties: ReadonlyArray<SetFieldQueryNode>;
}

export class UpdateObjectInputType extends TypedInputObjectType<UpdateInputField> {
    private readonly childEntityFields: ReadonlyArray<Field>;

    constructor(
        protected readonly objectType: ObjectType,
        name: string,
        fields: Thunk<ReadonlyArray<UpdateInputField>>
    ) {
        super(name, fields);
        this.childEntityFields = this.objectType.fields.filter(f => f.type.isChildEntityType && !f.isCollectField);
    }

    getProperties(value: PlainObject, context: UpdateInputFieldContext): ReadonlyArray<SetFieldQueryNode> {
        const applicableFields = this.getApplicableInputFields(value);
        const regularProperties = [
            ...flatMap(applicableFields, field => field.getProperties(value[field.name], context)),
            ...flatMap(this.childEntityFields, field => this.getChildEntityProperties(value, field, context))
        ];
        return [...regularProperties, ...this.getAdditionalProperties(value, { ...context, regularProperties })];
    }

    check(value: PlainObject, context: FieldContext): RuntimeErrorQueryNode | undefined {
        const applicableFields = this.getApplicableInputFields(value);
        const fields = applicableFields.filter(f => f.field.type.isScalarType);
        const groups = objectEntries(groupBy(fields, f => f.field.name));
        const duplicateGroups = groups.filter(([key, value]) => value.length > 1);
        const firstDuplicateGroup: [string, ReadonlyArray<UpdateInputField>] = duplicateGroups[0];
        if (!firstDuplicateGroup) {
            return undefined;
        }
        const fieldNames = firstDuplicateGroup[1].map(inputField => `"${inputField.name}"`);
        throw createGraphQLError(`Can't combine ${joinWithAnd(fieldNames)} in "${this.name}"`, context);
    }

    private getChildEntityProperties(
        objectValue: PlainObject,
        field: Field,
        context: UpdateInputFieldContext
    ): ReadonlyArray<SetFieldQueryNode> {
        if (!field.type.isChildEntityType) {
            throw new Error(`Expected "${field.type.name}" to be a child entity type`);
        }

        const addField = this.getFieldOrThrow(getAddChildEntitiesFieldName(field.name), AddChildEntitiesInputField);
        const updateField = this.getFieldOrThrow(
            getUpdateChildEntitiesFieldName(field.name),
            UpdateChildEntitiesInputField
        );
        const removeField = this.getFieldOrThrow(getRemoveChildEntitiesFieldName(field.name));

        const newValues = (objectValue[addField.name] || []) as ReadonlyArray<AnyValue>;
        const updatedValues = (objectValue[updateField.name] || []) as ReadonlyArray<AnyValue>;
        const removedIDs = (objectValue[removeField.name] || []) as ReadonlyArray<AnyValue>;

        if (!newValues.length && !updatedValues.length && !removedIDs.length) {
            return [];
        }

        const childEntityType = field.type;
        const idField = childEntityType.getFieldOrThrow(ID_FIELD);

        // first add, then delete, then update
        // -> delete trumps add
        // -> new values can be updated
        // -> update operates on reduced list (delete ones do not generate overhead)
        // generates a query like this:
        // FOR obj IN [...existing, ...newValues] FILTER !(obj.id IN removedIDs) RETURN obj.id == updateID ? update(obj) : obj
        const rawExistingNode = new FieldQueryNode(context.currentEntityNode, field);
        // fall back to empty list if property is not a list
        let currentNode: QueryNode = new SafeListQueryNode(rawExistingNode);

        if (newValues.length) {
            // wrap the whole thing into a LiteralQueryNode instead of them individually so that only one bound variable is used
            const newNode = new LiteralQueryNode(
                newValues.map(val => addField.createInputType.prepareValue(val as PlainObject, context))
            );
            currentNode = new ConcatListsQueryNode([currentNode, newNode]);
        }

        const childEntityVarNode = new VariableQueryNode(decapitalize(childEntityType.name));
        const childIDQueryNode = new FieldQueryNode(childEntityVarNode, idField);

        let removalFilterNode: QueryNode | undefined = undefined;
        if (removedIDs.length) {
            // FILTER !(obj.id IN [...removedIDs])
            removalFilterNode = new UnaryOperationQueryNode(
                new BinaryOperationQueryNode(childIDQueryNode, BinaryOperator.IN, new LiteralQueryNode(removedIDs)),
                UnaryOperator.NOT
            );
        }

        let updateMapNode: QueryNode | undefined = undefined;
        if (updatedValues.length) {
            // build an ugly conditional tree
            // looks like this:
            // - item
            // - item.id == 1 ? update1(item) : item
            // - item.id == 2 ? update2(item) : (item.id == 1 ? update1(item) : item)
            // ...
            updateMapNode = childEntityVarNode;

            for (const value of updatedValues) {
                const filterNode = new BinaryOperationQueryNode(
                    childIDQueryNode,
                    BinaryOperator.EQUAL,
                    new LiteralQueryNode((value as any)[ID_FIELD])
                );
                const updates = updateField.updateInputType.getProperties(value as PlainObject, {
                    ...context,
                    currentEntityNode: childEntityVarNode
                });
                const updateNode = new MergeObjectsQueryNode([childEntityVarNode, new ObjectQueryNode(updates)]);
                updateMapNode = new ConditionalQueryNode(filterNode, updateNode, updateMapNode);
            }
        }

        if (removalFilterNode || updateMapNode) {
            currentNode = new TransformListQueryNode({
                listNode: currentNode,
                filterNode: removalFilterNode,
                innerNode: updateMapNode,
                itemVariable: childEntityVarNode
            });
        }

        return [new SetFieldQueryNode(field, currentNode)];
    }

    protected getAdditionalProperties(
        value: PlainObject,
        context: AdditionalPropertiesContext
    ): ReadonlyArray<SetFieldQueryNode> {
        return [];
    }

    collectAffectedFields(value: PlainObject, fields: Set<Field>, context: FieldContext) {
        this.getApplicableInputFields(value).forEach(field =>
            field.collectAffectedFields(value[field.name], fields, context)
        );
    }

    getAffectedFields(value: PlainObject, context: FieldContext): ReadonlyArray<Field> {
        const fields = new Set<Field>();
        this.collectAffectedFields(value, fields, context);
        return Array.from(fields);
    }

    private getApplicableInputFields(value: PlainObject): ReadonlyArray<UpdateInputField> {
        return this.fields.filter(field => field.name in value || field.appliesToMissingFields());
    }
}

export class UpdateRootEntityInputType extends UpdateObjectInputType {
    private readonly updatedAtField: Field;
    readonly description: string;

    constructor(
        public readonly rootEntityType: RootEntityType,
        name: string,
        fields: Thunk<ReadonlyArray<UpdateInputField>>
    ) {
        super(rootEntityType, name, fields);
        this.description = `The update type for the root entity type \`${rootEntityType.name}\`.\n\nThe \`${ENTITY_UPDATED_AT}\` field is updated automatically unless only relations are updated. If fields are omitted, their value is left unchanged. Explicitly set fields to \`null\` to clear their value.`;
        this.updatedAtField = this.rootEntityType.getFieldOrThrow(ENTITY_UPDATED_AT);
    }

    getAdditionalProperties(value: PlainObject, { regularProperties }: AdditionalPropertiesContext) {
        if (!regularProperties.length) {
            // don't change updatedAt if only relations change
            return [];
        }
        const now = getCurrentISODate();
        return [new SetFieldQueryNode(this.updatedAtField, new LiteralQueryNode(now))];
    }

    getRelationStatements(
        input: PlainObject,
        idNode: QueryNode,
        context: FieldContext
    ): ReadonlyArray<PreExecQueryParms> {
        const relationFields = this.fields
            .filter(isRelationUpdateField)
            .filter(field => field.appliesToMissingFields() || field.name in input);
        return flatMap(relationFields, field => field.getStatements(input[field.name], idNode, context));
    }

    protected transformFieldConfigs(fields: GraphQLInputFieldConfigMap): GraphQLInputFieldConfigMap {
        return {
            ...fields,
            [REVISION_FIELD]: {
                type: GraphQLID,
                description: `Set this field to the value of "${this.rootEntityType.name}.${REVISION_FIELD}" to abort the transaction if this object has been modified in the meantime`
            }
        };
    }

    getRevision(input: PlainObject): string | undefined {
        return (input[REVISION_FIELD] || undefined) as string | undefined;
    }
}

export class UpdateEntityExtensionInputType extends UpdateObjectInputType {
    readonly description: string;

    constructor(
        public readonly entityExtensionType: EntityExtensionType,
        name: string,
        fields: Thunk<ReadonlyArray<UpdateInputField>>
    ) {
        super(entityExtensionType, name, fields);
        this.description = `The update type for the entity extension type \`${entityExtensionType.name}\`.\n\nIf fields are omitted, their value is left unchanged. Explicitly set fields to \`null\` to clear their value.`;
    }
}

export class UpdateChildEntityInputType extends UpdateObjectInputType {
    private readonly updatedAtField: Field;
    readonly description: string;

    constructor(
        private readonly childEntityType: ChildEntityType,
        name: string,
        fields: Thunk<ReadonlyArray<UpdateInputField>>
    ) {
        super(childEntityType, name, fields);
        this.updatedAtField = this.childEntityType.getFieldOrThrow(ENTITY_UPDATED_AT);
        this.description = `The update type for the child entity type \`${this.childEntityType.name}\`.\n\nIf fields are omitted, their value is left unchanged. Explicitly set fields to \`null\` to clear their value.`;
    }

    getAdditionalProperties() {
        const now = getCurrentISODate();
        // always update updatedAt because all input fields directly affect the child entity
        return [new SetFieldQueryNode(this.updatedAtField, new LiteralQueryNode(now))];
    }
}
