import {buildASTSchema, DocumentNode, GraphQLSchema, parse, print, Source} from "graphql";
import {prepareModelAST} from "./preparation/ast-transformer";

/*
 Create a schema for a given model definition. A model definition is an array of definition parts, represented as a (sourced) SDL string or AST document.
  */
export function createSchema(modelDefinition: Array<Source | DocumentNode>): GraphQLSchema {
    let ast = mergeModelDefinition(modelDefinition);
    ast = prepareModelAST(ast);
    console.log(print(ast));
    return buildASTSchema(ast);
}

function mergeModelDefinition(modelDefinitions: Array<Source | DocumentNode>): DocumentNode {
    return modelDefinitions.map(modelDef => (modelDef instanceof Source) ? parse(modelDef) : modelDef).reduce(mergeAST);
}

function mergeAST(doc1: DocumentNode, doc2: DocumentNode): DocumentNode {
    return {
        kind: "Document",
        definitions: [...doc1.definitions, ...doc2.definitions]
    }
}