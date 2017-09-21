import {buildASTSchema, DocumentNode, GraphQLSchema, parse, Source, visit} from "graphql";
import {isNullOrUndefined} from "util";
import {OBJECT_TYPE_DEFINITION} from "graphql/language/kinds";
import {prepareModelAST} from "./preparation/ast-transformer";

/*
 Create a schema for a given model definition. A model definition is an array of definition parts, represented as a (sourced) SDL string or AST document.
  */
export function createSchema(modelDefinition: Array<Source | DocumentNode>): GraphQLSchema {
    const ast = mergeModelDefinition(modelDefinition);
    prepareModelAST(ast);
    return buildASTSchema(ast);
}

function mergeModelDefinition(definitions: Array<Source | DocumentNode>): DocumentNode {
    return definitions.map(definition => (definition instanceof Source) ? parse(definition) : definition).reduce(mergeAST);
}

function mergeAST(doc1: DocumentNode, doc2: DocumentNode): DocumentNode {
    return {
        kind: "Document",
        definitions: [...doc1.definitions, ...doc2.definitions]
    }
}