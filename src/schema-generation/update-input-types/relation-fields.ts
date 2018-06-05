import { GraphQLID, GraphQLInputType, GraphQLList, GraphQLNonNull } from 'graphql';
import { getAddRelationFieldName, getRemoveRelationFieldName } from '../../graphql/names';
import { Field } from '../../model';
import { PreExecQueryParms, QueryNode, SetFieldQueryNode } from '../../query-tree';
import { AnyValue } from '../../utils/utils';
import { getAddEdgesStatements, getRemoveEdgesStatements, getSetEdgeStatements } from '../utils/relations';
import { UpdateInputField } from './input-fields';

export abstract class AbstractRelationUpdateInputField implements UpdateInputField {
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

    getProperties(value: AnyValue): ReadonlyArray<SetFieldQueryNode> {
        return [];
    }

    abstract getStatements(value: AnyValue, idNode: QueryNode): ReadonlyArray<PreExecQueryParms>
}

export class SetEdgeInputField extends AbstractRelationUpdateInputField {
    readonly inputType: GraphQLInputType = GraphQLID;

    getStatements(targetID: AnyValue, sourceIDNode: QueryNode): ReadonlyArray<PreExecQueryParms> {
        return getSetEdgeStatements(this.field, sourceIDNode, targetID as string|null);
    }
}

export class AddEdgesInputField extends AbstractRelationUpdateInputField {
    readonly inputType: GraphQLInputType = new GraphQLList(new GraphQLNonNull(GraphQLID));

    get name() {
        return getAddRelationFieldName(this.field.name);
    }

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

export class RemoveEdgesInputField extends AbstractRelationUpdateInputField {
    readonly inputType: GraphQLInputType = new GraphQLList(new GraphQLNonNull(GraphQLID));

    get name() {
        return getRemoveRelationFieldName(this.field.name);
    }

    getStatements(value: AnyValue, sourceIDNode: QueryNode): ReadonlyArray<PreExecQueryParms> {
        if (value == undefined) {
            return [];
        }
        if (!Array.isArray(value)) {
            throw new Error(`Expected value of "${this.name}" to be an array, but is ${typeof value}`);
        }

        return getRemoveEdgesStatements(this.field, sourceIDNode, value as ReadonlyArray<string>);
    }
}

export function isRelationUpdateField(field: UpdateInputField): field is AbstractRelationUpdateInputField {
    return field instanceof AbstractRelationUpdateInputField;
}
