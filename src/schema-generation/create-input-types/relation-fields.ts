import { GraphQLID, GraphQLInputType, GraphQLList, GraphQLNonNull } from 'graphql';
import { Field } from '../../model';
import { PreExecQueryParms, QueryNode } from '../../query-tree';
import { AnyValue, capitalize, PlainObject } from '../../utils/utils';
import { getAddEdgesStatements, getCreateAndAddEdgesStatements, getSetEdgeStatements } from '../utils/relations';
import { CreateInputField } from './input-fields';
import { CREATE_RELATED_ENTITY_FIELD_PREFIX } from '../../schema/schema-defaults';
import { CreateObjectInputType, CreateRootEntityInputType } from './input-types';

export abstract class AbstractRelationCreateInputField implements CreateInputField {
    constructor(
        public readonly field: Field
    ) {

    }

    abstract readonly inputType: GraphQLInputType;

    get name() {
        return this.field.name;
    }

    appliesToMissingFields(): boolean {
        return false;
    }

    collectAffectedFields(value: AnyValue, fields: Set<Field>): void {
        fields.add(this.field);
    }

    getProperties(value: AnyValue): PlainObject {
        return {};
    }

    abstract getStatements(value: AnyValue, idNode: QueryNode): ReadonlyArray<PreExecQueryParms>
}

export class AddEdgeCreateInputField extends AbstractRelationCreateInputField {
    readonly inputType: GraphQLInputType = GraphQLID;

    getStatements(targetID: AnyValue, sourceIDNode: QueryNode): ReadonlyArray<PreExecQueryParms> {
        if (targetID == undefined) {
            return [];
        }

        return getSetEdgeStatements(this.field, sourceIDNode, targetID as string);
    }
}

export class AddEdgesCreateInputField extends AbstractRelationCreateInputField {
    readonly inputType: GraphQLInputType = new GraphQLList(new GraphQLNonNull(GraphQLID));

    getStatements(value: AnyValue, sourceIDNode: QueryNode): ReadonlyArray<PreExecQueryParms> {
        if (value == undefined) {
            return [];
        }
        if (!Array.isArray(value)) {
            throw new Error(`Expected value of "${this.name}" to be an array, but is ${typeof value}`);
        }

        return getAddEdgesStatements(this.field, sourceIDNode, value as ReadonlyArray<string>);
    }
}

export class CreateAndAddEdgesCreateInputField extends AbstractRelationCreateInputField {
    readonly inputType: GraphQLInputType;

    constructor(
        public readonly field: Field,
        public readonly objectInputType: CreateRootEntityInputType
    ) {
        super(field);

        this.inputType = new GraphQLList(new GraphQLNonNull(objectInputType.getInputType()));
    }

    get name() {
        return CREATE_RELATED_ENTITY_FIELD_PREFIX+capitalize(this.field.name);
    }

    getStatements(value: AnyValue, sourceIDNode: QueryNode): ReadonlyArray<PreExecQueryParms> {
        if (value == undefined) {
            return [];
        }
        if (!Array.isArray(value)) {
            throw new Error(`Expected value of "${this.name}" to be an array, but is ${typeof value}`);
        }

        return getCreateAndAddEdgesStatements(this.field, sourceIDNode, this.objectInputType, value as ReadonlyArray<PlainObject>);
    }
}


export function isRelationCreateField(field: CreateInputField): field is AbstractRelationCreateInputField {
    return field instanceof AbstractRelationCreateInputField;
}
