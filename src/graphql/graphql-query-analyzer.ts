import {
    FieldNode, FragmentDefinitionNode, getNamedType, GraphQLCompositeType, GraphQLField, GraphQLObjectType,
    GraphQLOutputType, isCompositeType
} from 'graphql';

import { getArgumentValues, resolveSelections } from './field-collection';
import { groupArray, indent, INDENTATION } from '../utils/utils';

/**
 * A request for the value of one field with a specific argument set and selection set
 */
export class FieldRequest {
    constructor(public readonly field: GraphQLField<any, any>,
                public readonly parentType: GraphQLCompositeType,
                public readonly selectionSet: FieldSelection[] = [],
                public readonly args: {[argumentName: string ]: any} = {},
                ) {
    }

    public get fieldName() {
        return this.field.name;
    }

    /**
     * Finds a fieldRequest in the selection set that matches the given name
     *
     * This is here to ease transition. Finally, it should no longer be used because it disregards aliases.
     * @param fieldName
     * @returns the FieldRequest for the given field, or null if it was not requested
     */
    public getChildField(fieldName: string) {
        return this.selectionSet
                .filter(selection => selection.fieldRequest.fieldName == fieldName)
                .map(selection => selection.fieldRequest)
                [0] || null;
    }

    public describe(): string {
        const selectionItemsDesc = this.selectionSet
            .map(selection => `${JSON.stringify(selection.propertyName)}: ${selection.fieldRequest.describe()}`)
            .join(',\n');
        const selectionDesc = selectionItemsDesc ? ` with selections {\n${indent(selectionItemsDesc)}\n}` : '';
        const argsDesc = (this.args && Object.getOwnPropertyNames(this.args).length) ?
            ` with args ${JSON.stringify(this.args, null, INDENTATION)}` : '';

        return `field ${this.fieldName}${argsDesc}${selectionDesc}`;
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


interface FieldRequestConfig {
    field: GraphQLField<any, any>;
    parentType: GraphQLCompositeType;
    selectionSet?: SelectionSetConfig
    args?: {[argumentName: string ]: any};
}
export type SelectionSetConfig = { [ propertyName: string]: FieldRequestConfig};

/**
 * Creates a {@link FieldRequest} from a simple JSON-like object
 * @param config the config
 * @returns {FieldRequest} the created field request
 */
export function createFieldRequest(config: FieldRequestConfig) {
    return new FieldRequest(config.field, config.parentType, createSelectionSet(config.selectionSet || {}), config.args || {});
}

function createSelectionSet(config: SelectionSetConfig): FieldSelection[] {
    const selections = [];
    for (const key in config) {
        selections.push(new FieldSelection(key, createFieldRequest(config[key])));
    }
    return selections;
}



interface Context {
    fragments: {[fragmentName: string]: FragmentDefinitionNode};
    variableValues: {[variableName: string]: any};
}

interface FieldInfo {
    fieldName: string;
    fieldNodes: Array<FieldNode>;
    parentType: GraphQLCompositeType;
}

interface FieldRequestInput extends Context, FieldInfo {
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
export function buildFieldRequest(input: FieldRequestInput): FieldRequest {
    const allSubFields = getAllSelections(input.fieldNodes, input);
    const subFieldsPerProperty = groupArray(allSubFields, node => getPropertyName(node));

    if (!(input.parentType instanceof GraphQLObjectType)) {
        throw new Error(`Interfaces and union types are not supported yet`);
    }
    const fieldDef = input.parentType.getFields()[input.fieldName];
    if (!fieldDef) {
        throw new Error(`Field ${input.fieldName} is not defined in parent type ${input.parentType}`);
    }

    let selections: FieldSelection[] = [];
    const compositeFieldType = unwrapToCompositeType(fieldDef.type);
    if (compositeFieldType) {
        selections = Array.from(subFieldsPerProperty)
            .map(([propertyName, subFieldsOfProperty]) => new FieldSelection(propertyName, buildFieldRequest({
                ...input,
                parentType: compositeFieldType,
                fieldNodes: subFieldsOfProperty,
                fieldName: subFieldsOfProperty[0].name.value // groupArray will not generate empty groups
            })));
    }

    // GraphQL disallows multiple requests of the same field with different arguments and same alias, so we can just pick one
    const anyField = input.fieldNodes[0];
    if (!anyField) {
        throw new Error('fieldNodes should not be empty');
    }
    const args = getArgumentValues(fieldDef, anyField, input.variableValues);

    return new FieldRequest(fieldDef, input.parentType, selections, args);
}

export function unwrapToCompositeType(type: GraphQLOutputType): GraphQLCompositeType|null {
    const namedType = getNamedType(type);
    if (isCompositeType(namedType)) {
        return namedType;
    }
    return null;
}

/**
 * Gets the target property name for the field (i.e. the alias if given, the field name otherwise)
 * @param fieldNode
 */
function getPropertyName(fieldNode: FieldNode) {
    if (fieldNode.alias) {
        return fieldNode.alias.value;
    }
    return fieldNode.name.value;
}

/**
 * Merges the selections of the given field nodes and resolves fragments
 * @param fieldNodes the nodes that request a given field x
 * @return all the field nodes that are requested in the context of that field x
 */
function getAllSelections(fieldNodes: FieldNode[], context: Context): FieldNode[] {
    const fields: FieldNode[] = [];

    for (const node of fieldNodes) {
        const selectionSet = node.selectionSet;
        if (!selectionSet) {
            // This field node selected the parent field, but it did not select anything from it, so it does not
            // contribute anything to the merged selections
            continue;
        }
        fields.push(...resolveSelections(selectionSet, {
            variableValues: context.variableValues,
            fragments: context.fragments
        }));
    }
    return fields;
}
