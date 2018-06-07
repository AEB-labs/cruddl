import { GraphQLID, GraphQLInputType, GraphQLList, GraphQLNonNull } from 'graphql';
import { Field } from '../../model';
import { PreExecQueryParms, QueryNode } from '../../query-tree';
import { getCreateRelatedEntityFieldName } from '../../schema/names';
import { AnyValue, PlainObject } from '../../utils/utils';
import {
    getAddEdgesStatements, getCreateAndAddEdgesStatements, getCreateAndSetEdgeStatements, getSetEdgeStatements
} from '../utils/relations';
import { CreateInputField } from './input-fields';
import { CreateRootEntityInputType } from './input-types';

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

export class SetEdgeCreateInputField extends AbstractRelationCreateInputField {
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
        return getCreateRelatedEntityFieldName(this.field.name);
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

export class CreateAndSetEdgeCreateInputField extends AbstractRelationCreateInputField {
    readonly inputType: GraphQLInputType;

    constructor(
        public readonly field: Field,
        public readonly objectInputType: CreateRootEntityInputType
    ) {
        super(field);

        this.inputType = objectInputType.getInputType();
    }

    get name() {
        return getCreateRelatedEntityFieldName(this.field.name);
    }

    getStatements(value: AnyValue, sourceIDNode: QueryNode): ReadonlyArray<PreExecQueryParms> {
        if (value == undefined) {
            return [];
        }
        if (Array.isArray(value)) {
            throw new Error(`Expected value of "${this.name}" to be an object, but is ${typeof value}`);
        }

        return getCreateAndSetEdgeStatements(this.field, sourceIDNode, this.objectInputType, value as PlainObject);
    }
}

export function isRelationCreateField(field: CreateInputField): field is AbstractRelationCreateInputField {
    return field instanceof AbstractRelationCreateInputField;
}
