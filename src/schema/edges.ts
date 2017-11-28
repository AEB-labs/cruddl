import { getNamedType, GraphQLField, GraphQLObjectType } from 'graphql';
import { objectValues } from '../utils/utils';
import { isRelationField } from './schema-utils';

export enum RelationFieldEdgeSide {
    FROM_SIDE,
    TO_SIDE

}

export class EdgeType {
    constructor(params: { fromType: GraphQLObjectType, fromField?: GraphQLField<any, any>, toType: GraphQLObjectType, toField?: GraphQLField<any, any>, discriminator?: string }) {
        this.fromType = params.fromType;
        this.fromField = params.fromField;
        this.toType = params.toType;
        this.toField = params.toField;
        this.discriminator = params.discriminator;
    }

    public fromType: GraphQLObjectType;
    public fromField: GraphQLField<any, any>|undefined;
    public toType: GraphQLObjectType;
    public toField: GraphQLField<any, any>|undefined;
    public discriminator: string|undefined;


    public getRelationFieldEdgeSide(field:GraphQLField<any, any>): RelationFieldEdgeSide {
        if (this.fromField == field) {
            return RelationFieldEdgeSide.FROM_SIDE
        } else if (this.toField == field) {
            return RelationFieldEdgeSide.TO_SIDE
        } else {
            throw new Error(`Edge does not include the field ${field.name}`);
        }
    }

    private toString() {
        return `edge ${this.fromType.name}->${this.toType.name}` + (this.discriminator ? '/ ' + this.discriminator : '');
    }
}

export function getEdgeType(parentType: GraphQLObjectType, field: GraphQLField<any, any>) {
    const otherType = getNamedType(field.type);
    if (!(otherType instanceof GraphQLObjectType)) {
        throw new Error(`Relation field ${parentType.name}.${field.name} is of type ${field.type} which is not an object type`);
    }
    const opponentRelationFields = objectValues(otherType.getFields()).filter(otherTypeField => {
        if (!isRelationField(otherTypeField)) {
            return false;
        }
        const otherTypeFieldType = getNamedType(otherTypeField.type);
        return otherTypeFieldType === parentType && (parentType !== otherType || otherTypeField !== field)
    });
    let opponentField = undefined;
    if(opponentRelationFields.length > 1) {
        // TODO allow multiple references between two types. See discriminator
        throw new Error(`Currently there is only one relation between two types allowed, but found multiple fields to same type in ${otherType.name}: ${opponentRelationFields.map(f => f.name)}`);
    } else if (opponentRelationFields.length === 1) {
        opponentField = opponentRelationFields[0];
    }

    // TODO add discriminator
    if (parentType.name < otherType.name || (parentType.name === otherType.name && (!opponentField || field.name < opponentField.name))) {
        return new EdgeType({
            fromType: parentType,
            fromField: field,
            toType: otherType,
            toField: opponentField
        });
    } else {
        return new EdgeType({
            fromType: otherType,
            fromField: opponentField,
            toType: parentType,
            toField: field
        });
    }
}
