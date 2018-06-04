import { Thunk } from 'graphql';
import { Field, RootEntityType } from '../../model';
import { LiteralQueryNode, PreExecQueryParms, QueryNode, SetFieldQueryNode } from '../../query-tree';
import { ENTITY_UPDATED_AT } from '../../schema/schema-defaults';
import { flatMap, PlainObject } from '../../utils/utils';
import { TypedInputObjectType } from '../typed-input-object-type';
import { UpdateInputField } from './input-fields';

function getCurrentISODate() {
    return new Date().toISOString();
}

export class UpdateObjectInputType extends TypedInputObjectType<UpdateInputField> {
    constructor(
        name: string,
        fields: Thunk<ReadonlyArray<UpdateInputField>>
    ) {
        super(name, fields);
    }

    getProperties(value: PlainObject, currentEntityNode: QueryNode): ReadonlyArray<SetFieldQueryNode> {
        const applicableFields = this.getApplicableInputFields(value);
        return [
            ...flatMap(applicableFields, field => field.getProperties(value[field.name], currentEntityNode)),
            ...this.getAdditionalProperties(value)
        ];
    }

    protected getAdditionalProperties(value: PlainObject): ReadonlyArray<SetFieldQueryNode> {
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
        super(name, fields);
        this.updatedAtField = this.rootEntityType.getFieldOrThrow(ENTITY_UPDATED_AT);
    }

    getAdditionalProperties() {
        const now = getCurrentISODate();
        return [
            new SetFieldQueryNode(this.updatedAtField, new LiteralQueryNode(now)),
        ]
    }

    getRelationStatements(input: PlainObject, idNode: QueryNode): ReadonlyArray<PreExecQueryParms> {
        return []; // TODO
        /*const relationFields = this.fields
            .filter(isRelationCreateField)
            .filter(field => field.appliesToMissingFields() || field.name in input);
        return flatMap(relationFields, field => field.getStatements(input[field.name], idNode));*/
    }
}

export class UpdateEntityExtensionInputType extends UpdateObjectInputType {

}
