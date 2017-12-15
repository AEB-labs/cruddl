import {FieldDefinitionNode, getNamedType, GraphQLField, GraphQLObjectType} from 'graphql';
import {findDirectiveWithName, getNodeByName} from './schema-utils';
import {INVERSE_OF_ARG, RELATION_DIRECTIVE} from "./schema-defaults";
import {STRING} from "graphql/language/kinds";

export enum RelationFieldEdgeSide {
    FROM_SIDE,
    TO_SIDE

}

export class EdgeType {
    constructor(params: { fromType: GraphQLObjectType, fromField: GraphQLField<any, any>, toType: GraphQLObjectType, toField?: GraphQLField<any, any> }) {
        this.fromType = params.fromType;
        this.fromField = params.fromField;
        this.toType = params.toType;
        this.toField = params.toField;
    }

    public fromType: GraphQLObjectType;
    public fromField: GraphQLField<any, any>;
    public toType: GraphQLObjectType;
    public toField: GraphQLField<any, any>|undefined;


    public getRelationFieldEdgeSide(field:GraphQLField<any, any>): RelationFieldEdgeSide {
        if (this.fromField == field) {
            return RelationFieldEdgeSide.FROM_SIDE
        } else if (this.toField == field) {
            return RelationFieldEdgeSide.TO_SIDE
        } else {
            throw new Error(`Edge does not include the field ${field.name}`);
        }
    }

    public toString() {
        const fromFieldName = this.fromField ? `.${this.fromField.name}` : '';
        const toFieldName = this.toField ? `.${this.toField.name}` : '';
        return `edge ${this.fromType.name}${fromFieldName}->${this.toType.name}${toFieldName}`;
    }
}

function findInverseField(field: GraphQLField<any, any>): GraphQLField<any, any>|undefined {
    const relationDirective = findDirectiveWithName(field.astNode as FieldDefinitionNode, RELATION_DIRECTIVE);
    if (!relationDirective) { throw new Error(`Missing @relation on ${field.name}.`); }
    const inverseFieldName = getNodeByName(relationDirective!.arguments, INVERSE_OF_ARG);
    if (inverseFieldName && inverseFieldName.value.kind === STRING) {
        // should be an inverse relation
        const inverseField = (getNamedType(field.type) as GraphQLObjectType).getFields()[inverseFieldName.value.value];
        if (!inverseField) throw new Error(`Could not find inverse relation field of ${field.name} with name ${inverseFieldName.value.value}.`);
        return inverseField;
    } else {
        // should be a "forward" relation
        const oppositeTypeFields = (getNamedType(field.type) as GraphQLObjectType).getFields();
        for (const key in oppositeTypeFields) {
            const possibleField = oppositeTypeFields[key];
            const directive = findDirectiveWithName(possibleField.astNode as FieldDefinitionNode, RELATION_DIRECTIVE);
            if (directive) {
                const inverseOf = getNodeByName(directive.arguments, INVERSE_OF_ARG);
                if (inverseOf && inverseOf.value.kind === STRING && inverseOf.value.value === field.name) {
                    // that's it!
                    return possibleField;
                }
            }

        }
    }
    // No backlink available
    return undefined;
}

export function getEdgeType(parentType: GraphQLObjectType, field: GraphQLField<any, any>) {
    const otherType = getNamedType(field.type);
    if (!(otherType instanceof GraphQLObjectType)) {
        throw new Error(`Relation field ${parentType.name}.${field.name} is of type ${field.type} which is not an object type`);
    }

    const opponentField = findInverseField(field);

    if (parentType.name < otherType.name || (parentType.name === otherType.name && (!opponentField || field.name < opponentField.name))) {
        return new EdgeType({
            fromType: parentType,
            fromField: field,
            toType: otherType,
            toField: opponentField
        });
    } else {
        if (!opponentField) {
            throw new Error(`Bad @relation configuration for ${parentType.name}.${field.name}.`);
        }
        return new EdgeType({
            fromType: otherType,
            fromField: opponentField,
            toType: parentType,
            toField: field
        });
    }
}
