import { getNamedType, GraphQLField, GraphQLObjectType } from 'graphql';

export class EdgeType {
    constructor(params: { fromType: GraphQLObjectType, toType: GraphQLObjectType, discriminator?: string }) {
        this.fromType = params.fromType;
        this.toType = params.toType;
        this.discriminator = params.discriminator;
    }

    public fromType: GraphQLObjectType;
    public toType: GraphQLObjectType;
    public discriminator: string|undefined;

    private toString() {
        return `edge ${this.fromType.name}->${this.toType.name}` + (this.discriminator ? '/ ' + this.discriminator : '');
    }
}

export function getEdgeType(parentType: GraphQLObjectType, field: GraphQLField<any, any>) {
    const otherType = getNamedType(field.type);
    if (!(otherType instanceof GraphQLObjectType)) {
        throw new Error(`Relation field ${parentType.name}.${field.name} is of type ${field.type} which is not an object type`);
    }
    // TODO add discriminator
    if (parentType.name < otherType.name) {
        return new EdgeType({
            fromType: parentType,
            toType: otherType
        });
    } else {
        return new EdgeType({
            fromType: otherType,
            toType: parentType
        });
    }
}
