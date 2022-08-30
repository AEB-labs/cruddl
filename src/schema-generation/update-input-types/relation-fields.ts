import { GraphQLID, GraphQLInputType, GraphQLList, GraphQLNonNull } from 'graphql';
import { Field, Multiplicity } from '../../model';
import { PreExecQueryParms, QueryNode, SetFieldQueryNode } from '../../query-tree';
import {
    getAddRelationFieldName,
    getCreateRelatedEntityFieldName,
    getRemoveRelationFieldName,
} from '../../schema/names';
import { AnyValue, PlainObject } from '../../utils/utils';
import { CreateRootEntityInputType } from '../create-input-types';
import { FieldContext } from '../query-node-object-type';
import {
    getAddEdgesStatements,
    getCreateAndAddEdgesStatements,
    getCreateAndSetEdgeStatements,
    getRemoveEdgesStatements,
    getSetEdgeStatements,
} from '../utils/relations';
import { UpdateInputField } from './input-fields';

export abstract class AbstractRelationUpdateInputField implements UpdateInputField {
    readonly description: string;

    constructor(public readonly field: Field, public readonly name: string, description: string) {
        this.description = description + (field.description ? '\n\n' + field.description : '');
    }

    abstract readonly inputType: GraphQLInputType;

    appliesToMissingFields(): boolean {
        return false;
    }

    collectAffectedFields(value: AnyValue, fields: Set<Field>, context: FieldContext): void {
        fields.add(this.field);
    }

    getProperties(value: AnyValue, context: FieldContext): ReadonlyArray<SetFieldQueryNode> {
        return [];
    }

    abstract getStatements(
        value: AnyValue,
        idNode: QueryNode,
        context: FieldContext,
    ): ReadonlyArray<PreExecQueryParms>;
}

export class SetEdgeInputField extends AbstractRelationUpdateInputField {
    readonly inputType: GraphQLInputType = GraphQLID;

    constructor(field: Field) {
        super(
            field,
            field.name,
            `Sets the \`${field.name}\` relation to an existing \`${field.type.name}\` by its id.\n\n` +
                `If this \`${field.declaringType.name}\` already has a \`${field.name}\` relation` +
                (field.getRelationSideOrThrow().targetMultiplicity === Multiplicity.ONE
                    ? `, or the \`${field.type.name}\` is already related to a different \`${field.declaringType.name}\``
                    : '') +
                `, this relation is removed first.`,
        );
    }

    getStatements(targetID: AnyValue, sourceIDNode: QueryNode): ReadonlyArray<PreExecQueryParms> {
        return getSetEdgeStatements(this.field, sourceIDNode, targetID as string | null);
    }
}

export class AddEdgesInputField extends AbstractRelationUpdateInputField {
    readonly inputType: GraphQLInputType = new GraphQLList(new GraphQLNonNull(GraphQLID));

    constructor(field: Field) {
        super(
            field,
            getAddRelationFieldName(field.name),
            `Adds \`${field.name}\` relations to existing \`${field.type.pluralName}\` by their ids.` +
                (field.getRelationSideOrThrow().targetMultiplicity === Multiplicity.ONE
                    ? `\n\nIf one of the \`${field.type.pluralName}\` is already related to a different \`${field.declaringType.name}\`, these relations are removed first.`
                    : ''),
        );
    }

    getStatements(value: AnyValue, sourceIDNode: QueryNode): ReadonlyArray<PreExecQueryParms> {
        if (value == undefined) {
            return [];
        }
        if (!Array.isArray(value)) {
            throw new Error(
                `Expected value of "${this.name}" to be an array, but is ${typeof value}`,
            );
        }

        return getAddEdgesStatements(this.field, sourceIDNode, value as ReadonlyArray<string>);
    }
}

export class RemoveEdgesInputField extends AbstractRelationUpdateInputField {
    readonly inputType: GraphQLInputType = new GraphQLList(new GraphQLNonNull(GraphQLID));

    constructor(field: Field) {
        super(
            field,
            getRemoveRelationFieldName(field.name),
            `Removes \`${field.name}\` relations to existing \`${field.type.pluralName}\` by their ids.`,
        );
    }

    getStatements(value: AnyValue, sourceIDNode: QueryNode): ReadonlyArray<PreExecQueryParms> {
        if (value == undefined) {
            return [];
        }
        if (!Array.isArray(value)) {
            throw new Error(
                `Expected value of "${this.name}" to be an array, but is ${typeof value}`,
            );
        }

        return getRemoveEdgesStatements(this.field, sourceIDNode, value as ReadonlyArray<string>);
    }
}

export class CreateAndAddEdgesInputField extends AbstractRelationUpdateInputField {
    readonly inputType: GraphQLInputType;

    constructor(field: Field, public readonly objectInputType: CreateRootEntityInputType) {
        super(
            field,
            getCreateRelatedEntityFieldName(field.name),
            `Creates new \`${field.type.pluralName}\` and adds \`${field.name}\` relations between them and this \`${field.declaringType.name}\`.`,
        );
        this.inputType = new GraphQLList(new GraphQLNonNull(objectInputType.getInputType()));
    }

    getStatements(
        value: AnyValue,
        sourceIDNode: QueryNode,
        context: FieldContext,
    ): ReadonlyArray<PreExecQueryParms> {
        if (value == undefined) {
            return [];
        }
        if (!Array.isArray(value)) {
            throw new Error(
                `Expected value of "${this.name}" to be an array, but is ${typeof value}`,
            );
        }

        return getCreateAndAddEdgesStatements(
            this.field,
            sourceIDNode,
            this.objectInputType,
            value as ReadonlyArray<PlainObject>,
            context,
        );
    }
}

export class CreateAndSetEdgeInputField extends AbstractRelationUpdateInputField {
    readonly inputType: GraphQLInputType;

    constructor(field: Field, public readonly objectInputType: CreateRootEntityInputType) {
        super(
            field,
            getCreateRelatedEntityFieldName(field.name),
            `Creates a new \`${field.type.name}\` and sets the \`${field.name}\` relation to the created object.\n\n` +
                `If this \`${field.declaringType.name}\` already has a \`${field.name}\` relation, this relation is removed first.`,
        );
        this.inputType = objectInputType.getInputType();
    }

    getStatements(
        value: AnyValue,
        sourceIDNode: QueryNode,
        context: FieldContext,
    ): ReadonlyArray<PreExecQueryParms> {
        if (value == undefined) {
            return [];
        }
        if (Array.isArray(value)) {
            throw new Error(
                `Expected value of "${this.name}" to be an object, but is ${typeof value}`,
            );
        }

        return getCreateAndSetEdgeStatements(
            this.field,
            sourceIDNode,
            this.objectInputType,
            value as PlainObject,
            context,
        );
    }
}

export function isRelationUpdateField(
    field: UpdateInputField,
): field is AbstractRelationUpdateInputField {
    return field instanceof AbstractRelationUpdateInputField;
}
