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

function findOpponentFieldInfo(myField: GraphQLField<any, any>):
    { opponentField: GraphQLField<any, any>|undefined, myFieldSide: RelationFieldEdgeSide.FROM_SIDE}|{ opponentField: GraphQLField<any, any>, myFieldSide: RelationFieldEdgeSide.TO_SIDE} {
    const relationDirective = findDirectiveWithName(myField.astNode as FieldDefinitionNode, RELATION_DIRECTIVE);
    if (!relationDirective) { throw new Error(`Missing @relation on ${myField.name}.`); }
    const inverseOfArgument = getNodeByName(relationDirective!.arguments, INVERSE_OF_ARG);

    if (inverseOfArgument && inverseOfArgument.value.kind === STRING) {
        // if there is a inverseOf argument, myField is the TO side
        const opponentField = (getNamedType(myField.type) as GraphQLObjectType).getFields()[inverseOfArgument.value.value];
        if (!opponentField) throw new Error(`Could not find inverse relation field of ${myField.name} with name ${inverseOfArgument.value.value}.`);
        return { opponentField, myFieldSide: RelationFieldEdgeSide.TO_SIDE };
    }

    // No inverseOf argument, so myField is the FROM side

    // see if we find an inverse field
    const oppositeTypeFields = (getNamedType(myField.type) as GraphQLObjectType).getFields();
    for (const key in oppositeTypeFields) {
        const possibleField = oppositeTypeFields[key];
        const directive = findDirectiveWithName(possibleField.astNode as FieldDefinitionNode, RELATION_DIRECTIVE);
        if (directive) {
            const inverseOf = getNodeByName(directive.arguments, INVERSE_OF_ARG);
            if (inverseOf && inverseOf.value.kind === STRING && inverseOf.value.value === myField.name) {
                // that's it!
                return { opponentField: possibleField, myFieldSide: RelationFieldEdgeSide.FROM_SIDE };
            }
        }

    }

    // No inverse field available
    return { opponentField: undefined, myFieldSide: RelationFieldEdgeSide.FROM_SIDE };
}

export function getEdgeType(parentType: GraphQLObjectType, field: GraphQLField<any, any>) {
    const otherType = getNamedType(field.type);
    if (!(otherType instanceof GraphQLObjectType)) {
        throw new Error(`Relation field ${parentType.name}.${field.name} is of type ${field.type} which is not an object type`);
    }

    const opponentFieldInfo = findOpponentFieldInfo(field);

    switch(opponentFieldInfo.myFieldSide) {
        case RelationFieldEdgeSide.FROM_SIDE:
            return new EdgeType({
                fromType: parentType,
                fromField: field,
                toType: otherType,
                toField: opponentFieldInfo.opponentField
            });
        case RelationFieldEdgeSide.TO_SIDE:
            return new EdgeType({
                fromType: otherType,
                fromField: opponentFieldInfo.opponentField,
                toType: parentType,
                toField: field
            });
    }
}
