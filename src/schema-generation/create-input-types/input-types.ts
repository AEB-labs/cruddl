import { Thunk } from 'graphql';
import { fromPairs, toPairs } from 'lodash';
import { ChildEntityType, EntityExtensionType, Field, ObjectType, RootEntityType, ValueObjectType } from '../../model';
import {
    AffectedFieldInfoQueryNode,
    CreateBillingEntityQueryNode,
    CreateEntityQueryNode,
    EntityFromIdQueryNode,
    FirstOfListQueryNode,
    LiteralQueryNode,
    PreExecQueryParms,
    QueryNode,
    VariableAssignmentQueryNode,
    VariableQueryNode
} from '../../query-tree';
import { ENTITY_CREATED_AT, ENTITY_UPDATED_AT, ID_FIELD } from '../../schema/constants';
import { getCreateInputTypeName, getValueObjectInputTypeName } from '../../schema/names';
import { flatMap, PlainObject } from '../../utils/utils';
import { FieldContext } from '../query-node-object-type';
import { TypedInputObjectType } from '../typed-input-object-type';
import { createBillingEntityCategoryNode, createBillingEntityQuantityNode } from '../utils/billing-nodes';
import { CreateInputField } from './input-fields';
import { isRelationCreateField } from './relation-fields';
import uuid = require('uuid');

function getCurrentISODate() {
    return new Date().toISOString();
}

export class CreateObjectInputType extends TypedInputObjectType<CreateInputField> {
    constructor(type: ObjectType, name: string, fields: Thunk<ReadonlyArray<CreateInputField>>, description: string) {
        super(name, fields, description);
    }

    prepareValue(value: PlainObject, context: FieldContext): PlainObject {
        const applicableFields = this.getApplicableInputFields(value);
        for (const field of applicableFields) {
            field.validateInContext(value[field.name], { ...context, objectValue: value });
        }

        const properties = [
            ...flatMap(applicableFields, field => toPairs(field.getProperties(value[field.name], context))),
            ...toPairs(this.getAdditionalProperties(value))
        ];
        return fromPairs(properties);
    }

    protected getAdditionalProperties(value: PlainObject): PlainObject {
        return {};
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

    private getApplicableInputFields(value: PlainObject): ReadonlyArray<CreateInputField> {
        return this.fields.filter(field => field.name in value || field.appliesToMissingFields());
    }
}

export class CreateRootEntityInputType extends CreateObjectInputType {
    constructor(public readonly rootEntityType: RootEntityType, fields: Thunk<ReadonlyArray<CreateInputField>>) {
        super(
            rootEntityType,
            getCreateInputTypeName(rootEntityType.name),
            fields,
            `The create type for the root entity type \`${rootEntityType.name}\`.\n\nThe fields \`id\`, \`createdAt\`, and \`updatedAt\` are set automatically.`
        );
    }

    getCreateStatements(input: PlainObject, newEntityIdVarNode: VariableQueryNode, context: FieldContext) {
        // Create new entity
        const objectNode = new LiteralQueryNode(this.prepareValue(input, context));
        const affectedFields = this.getAffectedFields(input, context).map(
            field => new AffectedFieldInfoQueryNode(field)
        );
        const createEntityNode = new CreateEntityQueryNode(this.rootEntityType, objectNode, affectedFields);
        const newEntityPreExec = new PreExecQueryParms({ query: createEntityNode, resultVariable: newEntityIdVarNode });

        // Add relations if needed
        const relationStatements = this.getRelationStatements(input, newEntityIdVarNode, context);
        // Note: these statements contain validators which should arguably be moved to the front
        // works with transactional DB adapters, but e.g. not with JavaScript

        const preExecQueryParms = [newEntityPreExec, ...relationStatements];

        if (
            this.rootEntityType.billingEntityConfig &&
            this.rootEntityType.billingEntityConfig.keyFieldName &&
            input[this.rootEntityType.billingEntityConfig.keyFieldName]
        ) {
            const entityVar = new VariableQueryNode('entity');
            preExecQueryParms.push(
                new PreExecQueryParms({
                    query: new VariableAssignmentQueryNode({
                        variableValueNode: new EntityFromIdQueryNode(this.rootEntityType, newEntityIdVarNode),
                        variableNode: entityVar,
                        resultNode: new CreateBillingEntityQueryNode({
                            rootEntityTypeName: this.rootEntityType.name,
                            key: input[this.rootEntityType.billingEntityConfig.keyFieldName] as number | string,
                            categoryNode: createBillingEntityCategoryNode(
                                this.rootEntityType.billingEntityConfig,
                                entityVar
                            ),
                            quantityNode: createBillingEntityQuantityNode(
                                this.rootEntityType.billingEntityConfig,
                                entityVar
                            )
                        })
                    })
                })
            );
        }

        return preExecQueryParms;
    }

    getAdditionalProperties() {
        const now = getCurrentISODate();
        return {
            [ENTITY_CREATED_AT]: now,
            [ENTITY_UPDATED_AT]: now
        };
    }

    private getRelationStatements(
        input: PlainObject,
        idNode: QueryNode,
        context: FieldContext
    ): ReadonlyArray<PreExecQueryParms> {
        const relationFields = this.fields
            .filter(isRelationCreateField)
            .filter(field => field.appliesToMissingFields() || field.name in input);
        return flatMap(relationFields, field => field.getStatements(input[field.name], idNode, context));
    }
}

export class CreateChildEntityInputType extends CreateObjectInputType {
    constructor(public readonly childEntityType: ChildEntityType, fields: Thunk<ReadonlyArray<CreateInputField>>) {
        super(
            childEntityType,
            getCreateInputTypeName(childEntityType.name),
            fields,
            `The create type for the child entity type \`${childEntityType.name}\`.\n\nThe fields \`id\`, \`createdAt\`, and \`updatedAt\` are set automatically.`
        );
    }

    getAdditionalProperties() {
        const now = getCurrentISODate();
        return {
            [ID_FIELD]: uuid(),
            [ENTITY_CREATED_AT]: now,
            [ENTITY_UPDATED_AT]: now
        };
    }
}

export class CreateEntityExtensionInputType extends CreateObjectInputType {
    constructor(
        public readonly entityExtensionType: EntityExtensionType,
        fields: Thunk<ReadonlyArray<CreateInputField>>
    ) {
        super(
            entityExtensionType,
            getCreateInputTypeName(entityExtensionType.name),
            fields,
            `The create type for the entity extension type \`${entityExtensionType.name}\`.`
        );
    }
}

export class ValueObjectInputType extends CreateObjectInputType {
    constructor(public readonly valueObjectType: ValueObjectType, fields: Thunk<ReadonlyArray<CreateInputField>>) {
        super(
            valueObjectType,
            getValueObjectInputTypeName(valueObjectType.name),
            fields,
            `The create/update type for the value object type \`${valueObjectType.name}\`.\n\nIf this is used in an update mutation, missing fields are set to \`null\`.`
        );
    }
}
