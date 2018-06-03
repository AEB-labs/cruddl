import { GraphQLNonNull } from 'graphql';
import { flatMap } from 'lodash';
import memorize from 'memorize-decorator';
import * as pluralize from 'pluralize';
import { Namespace, RootEntityType } from '../model';
import {
    AffectedFieldInfoQueryNode, CreateEntityQueryNode, DeleteEntitiesQueryNode, EntitiesQueryNode,
    EntityFromIdQueryNode, FirstOfListQueryNode, LiteralQueryNode, ObjectQueryNode, PreExecQueryParms, QueryNode,
    VariableQueryNode, WithPreExecutionQueryNode
} from '../query-tree';
import {
    CREATE_ENTITY_FIELD_PREFIX, DELETE_ALL_ENTITIES_FIELD_PREFIX, DELETE_ENTITY_FIELD_PREFIX, FILTER_ARG,
    MUTATION_INPUT_ARG
} from '../schema/schema-defaults';
import { PlainObject } from '../utils/utils';
import { CreateInputTypeGenerator, CreateRootEntityInputType } from './create-input-types';
import { FilterObjectType, FilterTypeGenerator } from './filter-input-types';
import { OutputTypeGenerator } from './output-type-generator';
import { QueryNodeField, QueryNodeListType, QueryNodeNonNullType, QueryNodeObjectType } from './query-node-object-type';
import { getArgumentsForUniqueFields, getEntitiesByUniqueFieldQuery } from './utils/entities-by-uinque-field';
import { buildFilterQueryNode } from './utils/filtering';

export class MutationTypeGenerator {
    constructor(
        private readonly outputTypeGenerator: OutputTypeGenerator,
        private readonly createTypeGenerator: CreateInputTypeGenerator,
        private readonly filterTypeGenerator: FilterTypeGenerator
    ) {

    }

    @memorize()
    generate(namespace: Namespace): QueryNodeObjectType {
        const namespaceFields = namespace.childNamespaces.map((n): QueryNodeField => ({
            name: n.name || '',
            type: this.generate(n),
            resolve: () => new ObjectQueryNode([])
        }));

        const rootEntityFields = flatMap(namespace.rootEntityTypes, type => this.generateFields(type));

        return {
            name: `${namespace.pascalCasePath}Mutation`,
            fields: [
                ...namespaceFields,
                ...rootEntityFields
            ]
        };
    }

    private generateFields(rootEntityType: RootEntityType): QueryNodeField[] {
        return [
            this.generateCreateField(rootEntityType),
            this.generateDeleteField(rootEntityType),
            this.generateDeleteAllField(rootEntityType)
        ];
    }

    private generateCreateField(rootEntityType: RootEntityType): QueryNodeField {
        const inputType = this.createTypeGenerator.generateForRootEntityType(rootEntityType);

        return {
            name: `${CREATE_ENTITY_FIELD_PREFIX}${rootEntityType.name}`,
            type: this.outputTypeGenerator.generate(rootEntityType),
            args: {
                [MUTATION_INPUT_ARG]: {
                    type: new GraphQLNonNull(inputType.getInputType())
                }
            },
            resolve: (_, args) => this.generateCreateQueryNode(rootEntityType, args[MUTATION_INPUT_ARG], inputType)
        };
    }

    private generateCreateQueryNode(rootEntityType: RootEntityType, input: PlainObject, inputType: CreateRootEntityInputType): QueryNode {
        // Create new entity
        const objectNode = new LiteralQueryNode(inputType.prepareValue(input));
        const affectedFields = inputType.getAffectedFields(input).map(field => new AffectedFieldInfoQueryNode(field));
        const createEntityNode = new CreateEntityQueryNode(rootEntityType, objectNode, affectedFields);
        const newEntityIdVarNode = new VariableQueryNode('newEntityId');
        const newEntityPreExec = new PreExecQueryParms({query: createEntityNode, resultVariable: newEntityIdVarNode});

        // Add relations if needed
        const relationStatements = inputType.getRelationStatements(input, newEntityIdVarNode);
        // Note: these statements contain validators which should arguably be moved to the front
        // works with transactional DB adapters, but e.g. not with JavaScript

        // PreExecute creation and relation queries and return result
        return new WithPreExecutionQueryNode({
            resultNode: new EntityFromIdQueryNode(rootEntityType, newEntityIdVarNode),
            preExecQueries: [newEntityPreExec, ...relationStatements ]
        });
    }

    private generateDeleteField(rootEntityType: RootEntityType): QueryNodeField {
        return {
            name: `${DELETE_ENTITY_FIELD_PREFIX}${rootEntityType.name}`,
            type: this.outputTypeGenerator.generate(rootEntityType),
            args: getArgumentsForUniqueFields(rootEntityType),
            resolve: (_, args) => this.generateDeleteQueryNode(rootEntityType, args)
        };
    }

    private generateDeleteQueryNode(rootEntityType: RootEntityType, args: {[name: string]: any}): QueryNode {
        const listNode = getEntitiesByUniqueFieldQuery(rootEntityType, args);
        const deleteEntitiesNode = new DeleteEntitiesQueryNode({
            rootEntityType,
            listNode
        });

        // no preexec here because we need to evaluate the result while the entity still exists
        // and it won't exist if already deleted in the pre-exec
        return new FirstOfListQueryNode(deleteEntitiesNode);
    }

    private generateDeleteAllField(rootEntityType: RootEntityType): QueryNodeField {
        const filterType = this.filterTypeGenerator.generate(rootEntityType);

        return {
            name: `${DELETE_ALL_ENTITIES_FIELD_PREFIX}${pluralize(rootEntityType.name)}`,
            type: new QueryNodeNonNullType(new QueryNodeListType(new QueryNodeNonNullType(this.outputTypeGenerator.generate(rootEntityType)))),
            args: {
                [FILTER_ARG]: {
                    type: filterType.getInputType()
                }
            },
            resolve: (_, args) => this.generateDeleteAllQueryNode(rootEntityType, args, filterType)
        };
    }

    private generateDeleteAllQueryNode(rootEntityType: RootEntityType, args: {[name: string]: any}, filterType: FilterObjectType): QueryNode {
        const listNode = buildFilterQueryNode(new EntitiesQueryNode(rootEntityType), args, filterType, rootEntityType);
        // no preexec here because we need to evaluate the result while the entity still exists
        // and it won't exist if already deleted in the pre-exec
        return new DeleteEntitiesQueryNode({
            rootEntityType,
            listNode
        });
    }
}
