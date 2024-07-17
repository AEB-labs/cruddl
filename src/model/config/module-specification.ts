import { ASTNode } from 'graphql';

export interface ModuleSpecificationClauseConfig {
    readonly expression: string;
    readonly astNode?: ASTNode;
}

export interface BaseModuleSpecificationConfig {
    readonly in?: ReadonlyArray<ModuleSpecificationClauseConfig>;
    readonly astNode?: ASTNode;
    readonly inAstNode?: ASTNode;
}

export interface TypeModuleSpecificationConfig extends BaseModuleSpecificationConfig {
    readonly includeAllFields: boolean;
    readonly includeAllFieldsAstNode?: ASTNode;
}

export interface FieldModuleSpecificationConfig extends BaseModuleSpecificationConfig {
    readonly all: boolean;
    readonly allAstNode?: ASTNode;
}
