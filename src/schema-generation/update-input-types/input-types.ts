import { Thunk } from 'graphql';
import {
    getAddChildEntitiesFieldName, getRemoveChildEntitiesFieldName, getUpdateChildEntitiesFieldName
} from '../../graphql/names';
import { ChildEntityType, Field, ObjectType, RootEntityType } from '../../model';
import {
    BasicType, BinaryOperationQueryNode, BinaryOperator, ConcatListsQueryNode, ConditionalQueryNode, FieldQueryNode,
    ListQueryNode, LiteralQueryNode, MergeObjectsQueryNode, ObjectQueryNode, PreExecQueryParms, QueryNode,
    SetFieldQueryNode, TransformListQueryNode, TypeCheckQueryNode, UnaryOperationQueryNode, UnaryOperator,
    VariableQueryNode
} from '../../query-tree';
import { createSafeObjectQueryNode } from '../../query/mutations';
import { ENTITY_UPDATED_AT, ID_FIELD } from '../../schema/schema-defaults';
import { AnyValue, decapitalize, flatMap, PlainObject } from '../../utils/utils';
import { TypedInputObjectType } from '../typed-input-object-type';
import { AddChildEntitiesInputField, UpdateChildEntitiesInputField, UpdateInputField } from './input-fields';
import { isRelationUpdateField } from './relation-fields';

function getCurrentISODate() {
    return new Date().toISOString();
}

export class UpdateObjectInputType extends TypedInputObjectType<UpdateInputField> {
    private readonly childEntityFields: ReadonlyArray<Field>;

    constructor(
        protected readonly objectType: ObjectType,
        name: string,
        fields: Thunk<ReadonlyArray<UpdateInputField>>
    ) {
        super(name, fields);
        this.childEntityFields = this.objectType.fields.filter(f => f.type.isChildEntityType);
    }

    getProperties(value: PlainObject, currentEntityNode: QueryNode): ReadonlyArray<SetFieldQueryNode> {
        const applicableFields = this.getApplicableInputFields(value);
        const regularProperties = [
            ...flatMap(applicableFields, field => field.getProperties(value[field.name], currentEntityNode)),
            ...flatMap(this.childEntityFields, field => this.getChildEntityProperties(value, currentEntityNode, field))
        ];
        return [
            ...regularProperties,
            ...this.getAdditionalProperties(value, currentEntityNode, regularProperties)
        ];
    }

    private getChildEntityProperties(objectValue: PlainObject, currentEntityNode: QueryNode, field: Field): ReadonlyArray<SetFieldQueryNode> {
        if (!field.type.isChildEntityType) {
            throw new Error(`Expected "${field.type.name}" to be a child entity type`);
        }

        const addField = this.getFieldOrThrow(getAddChildEntitiesFieldName(field.name), AddChildEntitiesInputField);
        const updateField = this.getFieldOrThrow(getUpdateChildEntitiesFieldName(field.name), UpdateChildEntitiesInputField);
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
        const rawExistingNode = new FieldQueryNode(currentEntityNode, field);
        let currentNode: QueryNode = new ConditionalQueryNode( // fall back to empty list if property is not a list
            new TypeCheckQueryNode(rawExistingNode, BasicType.LIST), rawExistingNode, new ListQueryNode([]));

        if (newValues.length) {
            // wrap the whole thing into a LiteralQueryNode instead of them individually so that only one bound variable is used
            const newNode = new LiteralQueryNode(newValues.map(val => addField.createInputType.prepareValue(val as PlainObject)));
            currentNode = new ConcatListsQueryNode([currentNode, newNode]);
        }

        const childEntityVarNode = new VariableQueryNode(decapitalize(childEntityType.name));
        const childIDQueryNode = new FieldQueryNode(childEntityVarNode, idField);

        let removalFilterNode: QueryNode | undefined = undefined;
        if (removedIDs.length) {
            // FILTER !(obj.id IN [...removedIDs])
            removalFilterNode = new UnaryOperationQueryNode(
                new BinaryOperationQueryNode(
                    childIDQueryNode,
                    BinaryOperator.IN,
                    new LiteralQueryNode(removedIDs)
                ),
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
                const filterNode = new BinaryOperationQueryNode(childIDQueryNode, BinaryOperator.EQUAL, new LiteralQueryNode((value as any)[ID_FIELD]));
                const updates = updateField.updateInputType.getProperties(value as PlainObject, childEntityVarNode);
                const updateNode = new MergeObjectsQueryNode([
                    createSafeObjectQueryNode(childEntityVarNode),
                    new ObjectQueryNode(updates)
                ]);
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

    protected getAdditionalProperties(value: PlainObject, currentEntityNode: QueryNode, properties: ReadonlyArray<SetFieldQueryNode>): ReadonlyArray<SetFieldQueryNode> {
        return [];
    }

    collectAffectedFields(value: PlainObject, fields: Set<Field>) {
        this.getApplicableInputFields(value).forEach(field => field.collectAffectedFields(value[field.name], fields));
    }

    getAffectedFields(value: PlainObject): ReadonlyArray<Field> {
        const fields = new Set<Field>();
        this.collectAffectedFields(value, fields);
        return Array.from(fields);
    }

    private getApplicableInputFields(value: PlainObject): ReadonlyArray<UpdateInputField> {
        return this.fields.filter(field => field.name in value || field.appliesToMissingFields());
    }
}

export class UpdateRootEntityInputType extends UpdateObjectInputType {
    private readonly updatedAtField: Field;

    constructor(private readonly rootEntityType: RootEntityType, name: string, fields: Thunk<ReadonlyArray<UpdateInputField>>) {
        super(rootEntityType, name, fields);
        this.updatedAtField = this.rootEntityType.getFieldOrThrow(ENTITY_UPDATED_AT);
    }

    getAdditionalProperties(value: PlainObject, currentEntityNode: QueryNode, properties: ReadonlyArray<SetFieldQueryNode>) {
        if (!properties.length) {
            // don't change updatedAt if only relations change
            return [];
        }
        const now = getCurrentISODate();
        return [
            new SetFieldQueryNode(this.updatedAtField, new LiteralQueryNode(now))
        ];
    }

    getRelationStatements(input: PlainObject, idNode: QueryNode): ReadonlyArray<PreExecQueryParms> {
        const relationFields = this.fields
            .filter(isRelationUpdateField)
            .filter(field => field.appliesToMissingFields() || field.name in input);
        return flatMap(relationFields, field => field.getStatements(input[field.name], idNode));
    }
}

export class UpdateEntityExtensionInputType extends UpdateObjectInputType {

}

export class UpdateChildEntityInputType extends UpdateObjectInputType {
    private readonly updatedAtField: Field;

    constructor(private readonly childEntityType: ChildEntityType, name: string, fields: Thunk<ReadonlyArray<UpdateInputField>>) {
        super(childEntityType, name, fields);
        this.updatedAtField = this.childEntityType.getFieldOrThrow(ENTITY_UPDATED_AT);
    }

    getAdditionalProperties() {
        const now = getCurrentISODate();
        // always update updatedAt because all input fields directly affect the child entity
        return [
            new SetFieldQueryNode(this.updatedAtField, new LiteralQueryNode(now))
        ];
    }
}
