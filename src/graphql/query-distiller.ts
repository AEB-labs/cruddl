import { DocumentNode, FieldNode, FragmentDefinitionNode, getNamedType, GraphQLCompositeType, GraphQLField, GraphQLObjectType, GraphQLOutputType, GraphQLSchema, isCompositeType, OperationDefinitionNode, OperationTypeNode, SelectionNode } from 'graphql';
import { blue, cyan, green } from '../utils/colors';
import { arrayToObject, flatMap, groupArray, indent, INDENTATION } from '../utils/utils';
import { getArgumentValues } from './argument-values';
import { resolveSelections } from './field-collection';
import { getAliasOrName } from './language-utils';
import { extractOperation } from './operations';
import { getOperationRootType } from './schema-utils';

interface FieldRequestParams {
    readonly field: GraphQLField<unknown, unknown>
    readonly parentType: GraphQLCompositeType
    readonly schema: GraphQLSchema
    readonly selectionSet?: ReadonlyArray<FieldSelection>
    readonly args?: { [argumentName: string]: unknown }
    readonly fieldNodes?: ReadonlyArray<FieldNode>
}

/**
 * A request for the value of one field with a specific argument set and selection set
 */
export class FieldRequest {
    readonly field: GraphQLField<unknown, unknown>;
    readonly parentType: GraphQLCompositeType;
    readonly schema: GraphQLSchema;
    readonly selectionSet: ReadonlyArray<FieldSelection>;
    readonly args: { [argumentName: string]: any };
    readonly fieldNodes: ReadonlyArray<FieldNode>;

    constructor(config: FieldRequestParams) {
        this.field = config.field;
        this.parentType = config.parentType;
        this.schema = config.schema;
        this.selectionSet = config.selectionSet || [];
        this.args = config.args || {};
        this.fieldNodes = config.fieldNodes || [];
    }

    public get fieldName() {
        return this.field.name;
    }

    public describe(): string {
        const selectionItemsDesc = this.selectionSet
            .map(selection => `${green(JSON.stringify(selection.propertyName))}: ${selection.fieldRequest.describe()}`)
            .join(',\n');
        const selectionDesc = selectionItemsDesc ? ` with selections {\n${indent(selectionItemsDesc)}\n}` : '';
        const argsDesc = (this.args && Object.getOwnPropertyNames(this.args).length) ?
            ` with args ${cyan(JSON.stringify(this.args, null, INDENTATION))}` : '';

        return `field ${blue(this.fieldName)}${argsDesc}${selectionDesc}`;
    }
}

/**
 * A request for a field within a selection set. This is what gives a {@link FieldRequest} a property name in the result
 */
export class FieldSelection {
    /**
     * @param propertyName the name of the property the field request's value should be put in
     * @param fieldRequest determines the value for that property
     */
    constructor(public readonly propertyName: string,
                public readonly fieldRequest: FieldRequest) {

    }
}

/**
 * A simple description of a GraphQL operation
 */
export class DistilledOperation {
    constructor(public readonly operation: OperationTypeNode, public readonly selectionSet: ReadonlyArray<FieldSelection>) {
    }

    public describe(): string {
        const selectionItemsDesc = this.selectionSet
            .map(selection => `${green(JSON.stringify(selection.propertyName))}: ${selection.fieldRequest.describe()}`)
            .join(',\n');
        return `${this.operation} with selections {\n${indent(selectionItemsDesc)}\n}`;
    }
}

export interface OperationDistillationParams {
    schema: GraphQLSchema
    operation: OperationDefinitionNode
    variableValues: { [name: string]: any }
    fragments: { [fragmentName: string]: FragmentDefinitionNode }
}

/**
 * Creates a simplified description of an operation definition
 */
export function distillOperation(params: OperationDistillationParams): DistilledOperation {
    // needed to coerce values
    // not really sure when we should do this
    // I think it's idempotent, so won't do much harm except from performance penality
    const context = {
        variableValues: params.variableValues,
        fragments: params.fragments,
        schema: params.schema
    };

    const parentType = getOperationRootType(params.schema, params.operation.operation);
    if (!parentType) {
        throw new Error(`Schema does not have a ${params.operation.operation} root type`);
    }
    const selections = distillSelections(params.operation.selectionSet.selections, parentType, context);
    return new DistilledOperation(params.operation.operation, selections);
}

/**
 * Creates a simplified description of an operation in a query
 */
export function distillQuery(document: DocumentNode, schema: GraphQLSchema, variableValues: { [name: string]: any } = {}, operationName?: string): DistilledOperation {
    return distillOperation({
        schema,
        operation: extractOperation(document, operationName),
        fragments: arrayToObject(document.definitions.filter(def => def.kind == 'FragmentDefinition') as ReadonlyArray<FragmentDefinitionNode>, def => def.name.value),
        variableValues
    });
}

interface Context {
    fragments: { [fragmentName: string]: FragmentDefinitionNode };
    variableValues: { [variableName: string]: any };
    schema: GraphQLSchema;
}

/**
 * Creates simplified FieldSelection objects for a set of SelectionNodes
 */
function distillSelections(selections: ReadonlyArray<SelectionNode>, parentType: GraphQLCompositeType, context: Context): ReadonlyArray<FieldSelection> {
    const allFieldNodes: ReadonlyArray<FieldNode> = resolveSelections(selections, context);
    const allButSystemFieldNodes = allFieldNodes.filter(node => !node.name.value.startsWith('__'));
    const fieldNodesByPropertyName = groupArray(allButSystemFieldNodes, selection => getAliasOrName(selection));
    return Array.from(fieldNodesByPropertyName).map(([propertyName, fieldNodes]) =>
        new FieldSelection(propertyName, buildFieldRequest(fieldNodes, parentType, context)));
}

/**
 * Builds a {@link FieldRequest} representation of what is requested
 *
 * The purpose of this function is to parse a GraphQL query into a nicely-consumable tree of requested fields.
 *
 * It implements features as directives (@includes and @skip), fragments (inline and name), aliases, variables and
 * multi-selections (providing a field name multiple times). The user gets a description of what exactly needs to be
 * returned to the client.
 *
 * Not supported are unions, interfaces and possibly other features.
 */
function buildFieldRequest(fieldNodes: Array<FieldNode>, parentType: GraphQLCompositeType, context: Context): FieldRequest {
    const fieldName = fieldNodes[0].name.value;

    if (!(parentType instanceof GraphQLObjectType)) {
        throw new Error(`Interfaces and union types are not supported yet`);
    }
    const fieldDef = parentType.getFields()[fieldName];
    if (!fieldDef) {
        throw new Error(`Field ${fieldName} is not defined in parent type ${parentType}`);
    }

    let selections: ReadonlyArray<FieldSelection> = [];
    const compositeFieldType = unwrapToCompositeType(fieldDef.type);
    if (compositeFieldType) {
        const childFieldNodes = flatMap(fieldNodes, node => node.selectionSet ? node.selectionSet.selections : []);
        selections = distillSelections(childFieldNodes, compositeFieldType, context);
    }

    // GraphQL disallows multiple requests of the same field with different arguments and same alias, so we can just pick one
    const args = getArgumentValues(fieldDef, fieldNodes[0], context.variableValues);
    return new FieldRequest({
        field: fieldDef,
        parentType,
        schema: context.schema,
        selectionSet: selections,
        args,
        fieldNodes
    });
}

export function unwrapToCompositeType(type: GraphQLOutputType): GraphQLCompositeType | undefined {
    const namedType = getNamedType(type);
    if (isCompositeType(namedType)) {
        return namedType;
    }
    return undefined;
}
