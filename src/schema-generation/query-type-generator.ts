import { GraphQLID } from 'graphql';
import memorize from 'memorize-decorator';
import * as pluralize from 'pluralize';
import { Namespace, RootEntityType, ScalarType, Type } from '../model';
import {
    BinaryOperationQueryNode, BinaryOperator, EntitiesQueryNode, FirstOfListQueryNode, LiteralQueryNode,
    ObjectQueryNode, QueryNode, TransformListQueryNode, VariableQueryNode
} from '../query-tree';
import { createScalarFieldValueNode } from '../query/fields';
import { ALL_ENTITIES_FIELD_PREFIX } from '../schema/schema-defaults';
import { decapitalize, objectEntries } from '../utils/utils';
import { ListAugmentation } from './list-augmentation';
import { OutputTypeGenerator } from './output-type-generator';
import { QueryNodeField, QueryNodeListType, QueryNodeNonNullType, QueryNodeObjectType } from './query-node-object-type';

export class QueryTypeGenerator {
    constructor(
        private readonly outputTypeGenerator: OutputTypeGenerator,
        private readonly listAugmentation: ListAugmentation
    ) {

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

        const allRootEntitiesFields = namespace.rootEntityTypes.map((rootEntityType): QueryNodeField => {
            const fieldConfig = ({
                name: ALL_ENTITIES_FIELD_PREFIX + pluralize(rootEntityType.name),
                type: new QueryNodeNonNullType(new QueryNodeListType(new QueryNodeNonNullType(this.outputTypeGenerator.generate(rootEntityType)))),
                args: {},
                resolve: () => this.getAllRootEntities(rootEntityType)
            });
            return this.listAugmentation.augment(fieldConfig, rootEntityType);
        });

        return {
            name: `${namespace.pascalCasePath}Query`,
            fields: [
                ...namespaceFields,
                ...singleRootEntityFields,
                ...allRootEntitiesFields
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

    private getAllRootEntities(rootEntityType: RootEntityType): QueryNode {
        return new EntitiesQueryNode(rootEntityType);
    }
}

function getAsScalarTypeOrThrow(type: Type): ScalarType {
    if (!type.isScalarType) {
        throw new Error(`Expected "${type.name}" to be a scalar type, but is ${type.kind}`);
    }
    return type;
}
