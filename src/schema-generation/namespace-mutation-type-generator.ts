import { GraphQLNonNull } from 'graphql';
import { flatMap } from 'lodash';
import memorize from 'memorize-decorator';
import { Namespace, RootEntityType } from '../model/implementation';
import {
    AffectedFieldInfoQueryNode, CreateEntityQueryNode, EntityFromIdQueryNode, FirstOfListQueryNode, ListQueryNode,
    LiteralQueryNode, NullQueryNode, PreExecQueryParms, QueryNode, VariableQueryNode, WithPreExecutionQueryNode
} from '../query-tree';
import { getRelationAddRemoveStatements } from '../query/mutations';
import { CREATE_ENTITY_FIELD_PREFIX } from '../schema/schema-defaults';
import { PlainObject } from '../utils/utils';
import { CreateObjectInputType, CreateRootEntityInputType, CreateInputTypeGenerator } from './create-input-type-generator';
import { OutputTypeGenerator } from './output-type-generator';
import { QueryNodeField, QueryNodeObjectType } from './query-node-object-type';

export class NamespaceMutationTypeGenerator {
    constructor(
        private readonly outputTypeGenerator: OutputTypeGenerator,
        private readonly createTypeGenerator: CreateInputTypeGenerator
    ) {

    }

    @memorize()
    generate(namespace: Namespace): QueryNodeObjectType {
        const namespaceFields = namespace.childNamespaces.map((n): QueryNodeField => ({
            name: n.name || '',
            type: this.generate(n),
            resolve: () => new NullQueryNode()
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
            this.generateCreateField(rootEntityType)
        ];
    }

    private generateCreateField(rootEntityType: RootEntityType): QueryNodeField {
        const inputType = this.createTypeGenerator.generateForRootEntityType(rootEntityType);

        return {
            name: `${CREATE_ENTITY_FIELD_PREFIX}${rootEntityType.name}`,
            type: this.outputTypeGenerator.generate(rootEntityType),
            args: {
                input: {
                    type: new GraphQLNonNull(inputType.getInputType())
                }
            },
            resolve: (_, args) => this.generateCreateQueryNode(rootEntityType, args.input, inputType)
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
        let createRelationsPreExec: PreExecQueryParms|undefined = undefined;
        const relationStatements = getRelationAddRemoveStatements(input, rootEntityType, newEntityIdVarNode, false);
        if (relationStatements.length) {
            createRelationsPreExec = new PreExecQueryParms({ query:
                    new FirstOfListQueryNode(new ListQueryNode([new NullQueryNode(),...relationStatements]))});
        }

        // PreExecute creation and relation queries and return result
        return new WithPreExecutionQueryNode({
            resultNode: new EntityFromIdQueryNode(rootEntityType, newEntityIdVarNode),
            preExecQueries: [newEntityPreExec, createRelationsPreExec]
        });
    }
}
