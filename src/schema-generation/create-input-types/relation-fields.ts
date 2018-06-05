import { GraphQLID, GraphQLInputType, GraphQLList, GraphQLNonNull } from 'graphql';
import { Field } from '../../model';
import { PreExecQueryParms, QueryNode } from '../../query-tree';
import { AnyValue, PlainObject } from '../../utils/utils';
import { getAddEdgesStatements, getSetEdgeStatements } from '../utils/relations';
import { CreateInputField } from './input-fields';

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

export class ToOneRelationCreateInputField extends AbstractRelationCreateInputField {
    readonly inputType: GraphQLInputType = GraphQLID;

    getStatements(targetID: AnyValue, sourceIDNode: QueryNode): ReadonlyArray<PreExecQueryParms> {
        if (targetID == undefined) {
            return [];
        }

        return getSetEdgeStatements(this.field, sourceIDNode, targetID as string);
    }
}

export class ToManyRelationCreateInputField extends AbstractRelationCreateInputField {
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

export function isRelationCreateField(field: CreateInputField): field is AbstractRelationCreateInputField {
    return field instanceof AbstractRelationCreateInputField;
}
