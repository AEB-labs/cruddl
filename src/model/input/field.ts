import { FieldNode } from 'graphql';

export interface FieldInput {
    name: string
    typeName: string
    isList: boolean

    permissionProfileName?: string
    defaultValue?: any
    calcMutationOperators: CalcMutationsOperator[]
    isReference: boolean
    isRelation: boolean
    inverseOfFieldName?: string

    astNode?: FieldNode
}

export enum CalcMutationsOperator {
    MULTIPLY,
    DIVIDE,
    ADD,
    SUBTRACT,
    MODULO,
    APPEND,
    PREPEND
}
