import { GraphQLNonNull } from 'graphql';
import { flatMap } from 'lodash';
import memorize from 'memorize-decorator';
import { Namespace, RootEntityType } from '../model';
import {
    AffectedFieldInfoQueryNode, BinaryOperationQueryNode, BinaryOperator, CreateEntityQueryNode,
    DeleteEntitiesQueryNode, EntitiesQueryNode, EntityFromIdQueryNode, ErrorIfEmptyResultValidator,
    FirstOfListQueryNode, LiteralQueryNode, ObjectQueryNode, PreExecQueryParms, QueryNode, RootEntityIDQueryNode,
    TransformListQueryNode, UnknownValueQueryNode, UpdateEntitiesQueryNode, VariableQueryNode, WithPreExecutionQueryNode
} from '../query-tree';
import { ID_FIELD, MUTATION_INPUT_ARG, MUTATION_TYPE } from '../schema/constants';
import {
    getCreateEntityFieldName, getDeleteAllEntitiesFieldName, getDeleteEntityFieldName, getUpdateAllEntitiesFieldName,
    getUpdateEntityFieldName
} from '../schema/names';
import { decapitalize, PlainObject } from '../utils/utils';
import { CreateInputTypeGenerator, CreateRootEntityInputType } from './create-input-types';
import { ListAugmentation } from './list-augmentation';
import { OutputTypeGenerator } from './output-type-generator';
import {
    makeNonNullableList, QueryNodeField, QueryNodeNonNullType, QueryNodeObjectType
} from './query-node-object-type';
import { UpdateInputTypeGenerator, UpdateRootEntityInputType } from './update-input-types';
import { getArgumentsForUniqueFields, getEntitiesByUniqueFieldQuery } from './utils/entities-by-uinque-field';

export class MutationTypeGenerator {
    constructor(
        private readonly outputTypeGenerator: OutputTypeGenerator,
        private readonly createTypeGenerator: CreateInputTypeGenerator,
        private readonly updateTypeGenerator: UpdateInputTypeGenerator,
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

        const rootEntityFields = flatMap(namespace.rootEntityTypes, type => this.generateFields(type));

        return {
            name: namespace.pascalCasePath + MUTATION_TYPE,
            fields: [
                ...namespaceFields,
                ...rootEntityFields
            ]
        };
    }

    private generateFields(rootEntityType: RootEntityType): QueryNodeField[] {
        return [
            this.generateCreateField(rootEntityType),
            this.generateUpdateField(rootEntityType),
            this.generateUpdateAllField(rootEntityType),
            this.generateDeleteField(rootEntityType),
            this.generateDeleteAllField(rootEntityType)
        ];
    }

    private generateCreateField(rootEntityType: RootEntityType): QueryNodeField {
        const inputType = this.createTypeGenerator.generateForRootEntityType(rootEntityType);

        return {
            name: getCreateEntityFieldName(rootEntityType.name),
            type: new QueryNodeNonNullType(this.outputTypeGenerator.generate(rootEntityType)),
            args: {
                [MUTATION_INPUT_ARG]: {
                    type: new GraphQLNonNull(inputType.getInputType())
                }
            },
            resolve: (_, args) => this.generateCreateQueryNode(rootEntityType, args[MUTATION_INPUT_ARG], inputType)
        };
    }

    private generateCreateQueryNode(rootEntityType: RootEntityType, input: PlainObject, inputType: CreateRootEntityInputType): QueryNode {

        const newEntityIdVarNode = new VariableQueryNode('newEntityId');

        const createStatements = inputType.getCreateStatements(input, newEntityIdVarNode);

        // PreExecute creation and relation queries and return result
        return new WithPreExecutionQueryNode({
            resultNode: new EntityFromIdQueryNode(rootEntityType, newEntityIdVarNode),
            preExecQueries: [...createStatements]
        });
    }

    private generateUpdateField(rootEntityType: RootEntityType): QueryNodeField {
        const inputType = this.updateTypeGenerator.generateForRootEntityType(rootEntityType);

        return {
            name: getUpdateEntityFieldName(rootEntityType.name),
            type: this.outputTypeGenerator.generate(rootEntityType),
            args: {
                [MUTATION_INPUT_ARG]: {
                    type: new GraphQLNonNull(inputType.getInputType())
                }
            },
            resolve: (_, args) => this.generateUpdateQueryNode(rootEntityType, args[MUTATION_INPUT_ARG], inputType)
        };
    }

    private generateUpdateQueryNode(rootEntityType: RootEntityType, input: PlainObject, inputType: UpdateRootEntityInputType): QueryNode {
        const checkResult = inputType.check(input);
        if (checkResult) {
            return checkResult;
        }

        const currentEntityVariable = new VariableQueryNode('currentEntity');
        const updates = inputType.getProperties(input, currentEntityVariable);
        const affectedFields = inputType.getAffectedFields(input).map(field => new AffectedFieldInfoQueryNode(field));

        const listItemVar = new VariableQueryNode(decapitalize(rootEntityType.name));
        const filterNode = new BinaryOperationQueryNode(new RootEntityIDQueryNode(listItemVar),
            BinaryOperator.EQUAL,
            new LiteralQueryNode(input[ID_FIELD]));
        const listNode = new TransformListQueryNode({
            listNode: new EntitiesQueryNode(rootEntityType),
            filterNode: filterNode,
            maxCount: 1,
            itemVariable: listItemVar
        });

        const updateEntityNode = new UpdateEntitiesQueryNode({
            rootEntityType,
            affectedFields,
            updates,
            currentEntityVariable,
            listNode
        });
        const updatedIdsVarNode = new VariableQueryNode('updatedIds');
        const updateEntityPreExec = new PreExecQueryParms({
            query: updateEntityNode,
            resultVariable: updatedIdsVarNode,
            resultValidator: new ErrorIfEmptyResultValidator(`${rootEntityType.name} with id '${input[ID_FIELD]}' could not be found.`, 'NotFoundError')
        });

        const relationStatements = inputType.getRelationStatements(input, new FirstOfListQueryNode(updatedIdsVarNode));

        // PreExecute creation and relation queries and return result
        return new WithPreExecutionQueryNode({
            resultNode: new EntityFromIdQueryNode(rootEntityType, new FirstOfListQueryNode(updatedIdsVarNode)),
            preExecQueries: [
                updateEntityPreExec,
                ...relationStatements
            ]
        });
    }

    private generateUpdateAllField(rootEntityType: RootEntityType): QueryNodeField {
        // we construct this field like a regular query field first so that the list augmentation works
        const fieldBase: QueryNodeField = {
            name: getUpdateAllEntitiesFieldName(rootEntityType.name),
            type: makeNonNullableList(this.outputTypeGenerator.generate(rootEntityType)),
            resolve: () => new EntitiesQueryNode(rootEntityType)
        };

        const fieldWithListArgs = this.listAugmentation.augment(fieldBase, rootEntityType);

        const inputType = this.updateTypeGenerator.generateUpdateAllRootEntitiesInputType(rootEntityType);
        return {
            ...fieldWithListArgs,
            args: {
                ...fieldWithListArgs.args,
                [MUTATION_INPUT_ARG]: {
                    type: new GraphQLNonNull(inputType.getInputType())
                }
            },
            resolve: (_, args, info) => this.generateUpdateAllQueryNode(rootEntityType, fieldWithListArgs.resolve(_, args, info), inputType, args[MUTATION_INPUT_ARG])
        };
    }

    private generateUpdateAllQueryNode(rootEntityType: RootEntityType, listNode: QueryNode,
                                       inputType: UpdateRootEntityInputType, input: PlainObject): QueryNode {
        const checkResult = inputType.check(input);
        if (checkResult) {
            return checkResult;
        }

        const currentEntityVariable = new VariableQueryNode('currentEntity');
        const updates = inputType.getProperties(input, currentEntityVariable);
        const affectedFields = inputType.getAffectedFields(input).map(field => new AffectedFieldInfoQueryNode(field));

        const updateEntityNode = new UpdateEntitiesQueryNode({
            rootEntityType,
            affectedFields,
            updates,
            currentEntityVariable,
            listNode
        });
        const updatedIdsVarNode = new VariableQueryNode('updatedIds');
        const updateEntityPreExec = new PreExecQueryParms({
            query: updateEntityNode,
            resultVariable: updatedIdsVarNode
        });

        if (inputType.getRelationStatements(input, new UnknownValueQueryNode()).length) {
            // should not occur because the input type generator skips these fields, but just to be sure
            throw new Error(`updateAll currently does not support relation statements`);
        }

        const idVar = new VariableQueryNode('id');
        const resultNode = new TransformListQueryNode({
            listNode: updatedIdsVarNode,
            itemVariable: idVar,
            innerNode: new EntityFromIdQueryNode(rootEntityType, idVar)
        });

        return new WithPreExecutionQueryNode({
            resultNode,
            preExecQueries: [updateEntityPreExec]
        });
    }

    private generateDeleteField(rootEntityType: RootEntityType): QueryNodeField {
        return {
            name: getDeleteEntityFieldName(rootEntityType.name),
            type: this.outputTypeGenerator.generate(rootEntityType),
            args: getArgumentsForUniqueFields(rootEntityType),
            resolve: (source, args) => this.generateDeleteQueryNode(rootEntityType, args)
        };
    }

    private generateDeleteQueryNode(rootEntityType: RootEntityType, args: { [name: string]: any }): QueryNode {
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
        // we construct this field like a regular query field first so that the list augmentation works
        const fieldBase: QueryNodeField = {
            name: getDeleteAllEntitiesFieldName(rootEntityType.name),
            type: makeNonNullableList(this.outputTypeGenerator.generate(rootEntityType)),
            resolve: () => new EntitiesQueryNode(rootEntityType)
        };

        const fieldWithListArgs = this.listAugmentation.augment(fieldBase, rootEntityType);

        return {
            ...fieldWithListArgs,
            resolve: (source, args, info) => this.generateDeleteAllQueryNode(rootEntityType, fieldWithListArgs.resolve(source, args, info))
        };
    }

    private generateDeleteAllQueryNode(rootEntityType: RootEntityType, listNode: QueryNode): QueryNode {
        // no preexec here because we need to evaluate the result while the entity still exists
        // and it won't exist if already deleted in the pre-exec
        return new DeleteEntitiesQueryNode({
            rootEntityType,
            listNode
        });
    }
}
