import { GraphQLID } from 'graphql';
import memorize from 'memorize-decorator';
import { Namespace, RootEntityType, ScalarType, Type } from '../model';
import {
    BinaryOperationQueryNode, BinaryOperator, EntitiesQueryNode, FirstOfListQueryNode, LiteralQueryNode,
    ObjectQueryNode, QueryNode, TransformListQueryNode, VariableQueryNode
} from '../query-tree';
import { createScalarFieldValueNode } from '../query/fields';
import { decapitalize, objectEntries } from '../utils/utils';
import { OutputTypeGenerator } from './output-type-generator';
import { QueryNodeField, QueryNodeObjectType } from './query-node-object-type';

export class QueryTypeGenerator {
    constructor(private readonly outputTypeGenerator: OutputTypeGenerator) {

    }

    @memorize()
    generate(namespace: Namespace): QueryNodeObjectType {
        const namespaceFields = namespace.childNamespaces.map((n): QueryNodeField => ({
            name: n.name || '',
            type: this.generate(n),
            resolve: () => new ObjectQueryNode([])
        }));

        const singleRootEntityFields = namespace.rootEntityTypes.map((rootEntityType): QueryNodeField => ({
            name: rootEntityType.name,
            type: this.outputTypeGenerator.generate(rootEntityType),
            args: {
                id: {
                    type: GraphQLID
                },
                ...(
                    rootEntityType.keyField ? {
                        [rootEntityType.keyField.name]: {
                            type: getAsScalarTypeOrThrow(rootEntityType.keyField.type).graphQLScalarType
                        }
                    } : {}
                )
            },
            resolve: (_, args) => this.getSingleRootEntity(rootEntityType, args)
        }));

        return {
            name: `${namespace.pascalCasePath}Query`,
            fields: [
                ...namespaceFields,
                ...singleRootEntityFields
            ]
        };
    }

    private getSingleRootEntity(rootEntityType: RootEntityType, args: { [name: string]: any }): QueryNode {
        const entityVarNode = new VariableQueryNode(decapitalize(rootEntityType.name));
        const filterClauses = objectEntries(args).map(([fieldName, value]) =>
            new BinaryOperationQueryNode(createScalarFieldValueNode(rootEntityType, fieldName, entityVarNode), BinaryOperator.EQUAL, new LiteralQueryNode(value)));
        if (filterClauses.length != 1) {
            throw new Error(`Must specify exactly one argument to ${rootEntityType.toString()}`); // TODO throw this at the correct GraphQL query location
        }
        const filterNode = filterClauses[0];
        const listNode = new EntitiesQueryNode(rootEntityType);
        const filteredListNode = new TransformListQueryNode({
            listNode,
            filterNode,
            itemVariable: entityVarNode
        });
        return new FirstOfListQueryNode(filteredListNode);
    }
}

function getAsScalarTypeOrThrow(type: Type): ScalarType {
    if (!type.isScalarType) {
        throw new Error(`Expected "${type.name}" to be a scalar type, but is ${type.kind}`)
    }
    return type;
}
