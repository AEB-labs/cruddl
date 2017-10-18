import {buildASTSchema, DocumentNode, GraphQLSchema, parse, print, Source} from "graphql";
import {transformModel} from "./preparation/ast-transformer";
import {validateModel} from "./preparation/ast-validator";

/*
 Create a schema for a given model definition. A model definition is an array of definition parts, represented as a (sourced) SDL string or AST document.
  */
export function createSchema(modelDefinition: Array<Source | DocumentNode>): GraphQLSchema {
    const modelAST = mergeModelDefinition(modelDefinition);
    const validationResult = validateModel(modelAST);
    if(validationResult.hasErrors()) {
        throw new Error('Invalid model: ' + validationResult.messages.forEach(msg => msg.toString()))
    } else {
        console.log('Thank you for your valid model. I will now do some magic with it.')
    }
    const schemaAST = transformModel(modelAST);
    console.log(print(schemaAST));
    return buildASTSchema(schemaAST);
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