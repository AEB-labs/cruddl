import {
    buildASTSchema, GraphQLBoolean, GraphQLInputObjectType, GraphQLList,
    GraphQLNamedType, GraphQLNonNull,
    GraphQLObjectType,
    GraphQLSchema, GraphQLString,
    ObjectValueNode,
    valueFromAST
} from "graphql";
import {INDEX_DEFINITION_INPUT_TYPE, INDICES_ARG, INDICES_DIRECTIVE} from "../schema/schema-defaults";
import {getNodeByName, isRootEntityType} from "../schema/schema-utils";
import {compact, flatMap, objectValues} from "../utils/utils";
import {DOCUMENT, LIST, OBJECT} from "graphql/language/kinds";

export interface IndexDefinition {
    id: string,
    rootEntity: GraphQLNamedType,
    fields: string[],
    unique: boolean
}

export function getRequiredIndicesFromSchema(schema: GraphQLSchema) {

    const indexDefinitionInputObjectType = getIndexDefinitionInputObjectType();

    const rootEntities = objectValues(schema.getTypeMap()).filter(type => isRootEntityType(type)) as GraphQLObjectType[];
    return flatMap(rootEntities, rootEntity => {
        const rootEntityIndexDefinition = getNodeByName(rootEntity.astNode!.directives, INDICES_DIRECTIVE);
        if (rootEntityIndexDefinition == undefined) { return []; }
        const rootEntityIndexDefinitionArg = getNodeByName(rootEntityIndexDefinition.arguments, INDICES_ARG);
        if (rootEntityIndexDefinitionArg == undefined) { return []; }
        const indexDefinitionList = rootEntityIndexDefinitionArg.value;
        if (indexDefinitionList.kind !== LIST) {
            throw new Error(`Expected index definitions to be a list`);
        }
        return indexDefinitionList.values.map(indexDefinitionAST => {
            if (indexDefinitionAST.kind !== OBJECT) {
                throw new Error(`Expected object of type ${INDEX_DEFINITION_INPUT_TYPE}, got ${indexDefinitionAST.kind}`)
            }
            return mapIndexDefinition(rootEntity, indexDefinitionAST, indexDefinitionInputObjectType)
        })
    });
}

function mapIndexDefinition(rootEntity: GraphQLNamedType, index: ObjectValueNode, indexDefinitionInputObjectType: any): IndexDefinition {
    return {
        rootEntity,
        ...valueFromAST(index, indexDefinitionInputObjectType)
    }
}

export function calculateRequiredIndexOperations(existingIndices: IndexDefinition[], requiredIndices: IndexDefinition[]): { indicesToDelete: IndexDefinition[], indicesToCreate: IndexDefinition[] } {
    let indicesToDelete = [...existingIndices];
    const indicesToCreate = compact(requiredIndices.map(requiredIndex => {
        const existingIndex = existingIndices.find(index => index.fields.join('|') === requiredIndex.fields.join('|') && index.unique === requiredIndex.unique);
        indicesToDelete = indicesToDelete.filter(index => index !== existingIndex);
        if (!!existingIndex) {
            return undefined
        }
        return requiredIndex;
    }));
    return {indicesToDelete, indicesToCreate}
}

// fake input type for mapping
function getIndexDefinitionInputObjectType(): GraphQLInputObjectType {
    return new GraphQLInputObjectType({
        fields: {
            id: { type: GraphQLString },
            fields: { type: new GraphQLNonNull(new GraphQLList(GraphQLString))},
            unique: { type: GraphQLBoolean, defaultValue: false }
        },
        name: INDEX_DEFINITION_INPUT_TYPE
    })
}