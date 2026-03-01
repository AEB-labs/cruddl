import { GraphQLID, GraphQLInputType, GraphQLList, GraphQLNonNull } from 'graphql';
import { Field, Multiplicity } from '../../model/index.js';
import { PreExecQueryParms, QueryNode } from '../../query-tree/index.js';
import { getCreateRelatedEntityFieldName } from '../../schema/names.js';
import { AnyValue, isDefined, isReadonlyArray, PlainObject } from '../../utils/utils.js';
import { FieldContext } from '../query-node-object-type/index.js';
import {
    getAddEdgesStatements,
    getCreateAndAddEdgesStatements,
    getCreateAndSetEdgeStatements,
    getSetEdgeStatements,
} from '../utils/relations.js';
import { CreateInputField, FieldValidationContext } from './input-fields.js';
import { CreateRootEntityInputType } from './input-types.js';

export abstract class AbstractRelationCreateInputField implements CreateInputField {
    readonly description: string;

    constructor(
        public readonly field: Field,
        public readonly name: string,
        description: string,
    ) {
        this.description = description + (field.description ? '\n\n' + field.description : '');
    }

    abstract readonly inputType: GraphQLInputType;

    appliesToMissingFields(): boolean {
        return false;
    }

    collectAffectedFields(value: AnyValue, fields: Set<Field>): void {
        fields.add(this.field);
    }

    getProperties(value: AnyValue): PlainObject {
        return {};
    }

    validateInContext(value: AnyValue, context: FieldValidationContext): void {}

    abstract getStatements(
        value: AnyValue,
        idNode: QueryNode,
        context: FieldContext,
    ): ReadonlyArray<PreExecQueryParms>;
}

export class SetEdgeCreateInputField extends AbstractRelationCreateInputField {
    readonly inputType: GraphQLInputType = GraphQLID;

    constructor(field: Field) {
        super(
            field,
            field.name,
            `Sets the \`${field.name}\` relation to an existing \`${field.type.name}\` by its id.` +
                (field.getRelationSideOrThrow().targetMultiplicity === Multiplicity.ONE
                    ? `\n\nIf the \`${field.type.name}\` is already related to a different \`${field.declaringType.name}\`, this relation is removed first.`
                    : ''),
        );
    }

    getStatements(targetID: AnyValue, sourceIDNode: QueryNode): ReadonlyArray<PreExecQueryParms> {
        if (!isDefined(targetID)) {
            return [];
        }

        return getSetEdgeStatements(this.field, sourceIDNode, targetID as string);
    }
}

export class AddEdgesCreateInputField extends AbstractRelationCreateInputField {
    readonly inputType: GraphQLInputType = new GraphQLList(new GraphQLNonNull(GraphQLID));

    constructor(field: Field) {
        super(
            field,
            field.name,
            `Adds \`${field.name}\` relations to existing \`${field.type.pluralName}\` by their ids.` +
                (field.getRelationSideOrThrow().targetMultiplicity === Multiplicity.ONE
                    ? `\n\nIf one of the \`${field.type.pluralName}\` is already related to a different \`${field.declaringType.name}\`, these relations are removed first.`
                    : ''),
        );
    }

    getStatements(value: AnyValue, sourceIDNode: QueryNode): ReadonlyArray<PreExecQueryParms> {
        if (!isDefined(value)) {
            return [];
        }
        if (!isReadonlyArray(value)) {
            throw new Error(
                `Expected value of "${this.name}" to be an array, but is ${typeof value}`,
            );
        }

        return getAddEdgesStatements(this.field, sourceIDNode, value as ReadonlyArray<string>);
    }
}

export class CreateAndAddEdgesCreateInputField extends AbstractRelationCreateInputField {
    readonly inputType: GraphQLInputType;

    constructor(
        field: Field,
        public readonly objectInputType: CreateRootEntityInputType,
    ) {
        super(
            field,
            getCreateRelatedEntityFieldName(field.name),
            `Creates new \`${field.type.pluralName}\` and adds \`${field.name}\` relations between them and the new \`${field.declaringType.name}\`.`,
        );

        this.inputType = new GraphQLList(new GraphQLNonNull(objectInputType.getInputType()));
    }

    getStatements(
        value: AnyValue,
        sourceIDNode: QueryNode,
        context: FieldContext,
    ): ReadonlyArray<PreExecQueryParms> {
        if (!isDefined(value)) {
            return [];
        }
        if (!isReadonlyArray(value)) {
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

export class CreateAndSetEdgeCreateInputField extends AbstractRelationCreateInputField {
    readonly inputType: GraphQLInputType;

    constructor(
        field: Field,
        public readonly objectInputType: CreateRootEntityInputType,
    ) {
        super(
            field,
            getCreateRelatedEntityFieldName(field.name),
            `Creates a new \`${field.type.name}\` and adds a \`${field.name}\` relation between it and the new \`${field.declaringType.name}\`.`,
        );

        this.inputType = objectInputType.getInputType();
    }

    getStatements(
        value: AnyValue,
        sourceIDNode: QueryNode,
        context: FieldContext,
    ): ReadonlyArray<PreExecQueryParms> {
        if (!isDefined(value)) {
            return [];
        }
        if (isReadonlyArray(value)) {
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

export function isRelationCreateField(
    field: CreateInputField,
): field is AbstractRelationCreateInputField {
    return field instanceof AbstractRelationCreateInputField;
}
