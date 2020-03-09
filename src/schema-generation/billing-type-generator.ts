import { GraphQLBoolean } from 'graphql';
import memorize from 'memorize-decorator';
import { RootEntityType } from '../model/implementation';
import {
    BinaryOperationQueryNode,
    BinaryOperator,
    ConfirmForBillingQueryNode,
    EntitiesQueryNode,
    ErrorIfNotTruthyResultValidator,
    FieldQueryNode,
    FirstOfListQueryNode,
    LiteralQueryNode,
    PreExecQueryParms,
    QueryNode,
    RootEntityIDQueryNode,
    TransformListQueryNode,
    UpdateEntitiesQueryNode,
    VariableQueryNode,
    WithPreExecutionQueryNode
} from '../query-tree';
import { BILLING_MUTATION_INPUT_ARG } from '../schema/constants';
import { getConfirmForBillingFieldName } from '../schema/names';
import { OutputTypeGenerator } from './output-type-generator';
import { QueryNodeField } from './query-node-object-type';

export class BillingTypeGenerator {
    constructor(readonly outputTypeGenerator: OutputTypeGenerator) {}

    @memorize()
    getMutationField(rootEntityType: RootEntityType): QueryNodeField | undefined {
        if (!rootEntityType.billingEntityConfig || !rootEntityType.billingEntityConfig.billingKeyField) {
            return undefined;
        }
        if (!rootEntityType.billingEntityConfig.billingKeyField.type.isScalarType) {
            throw new Error('The BillingKeyField must'); // MSF TODO: proper error message
        }
        const inputType = rootEntityType.billingEntityConfig.billingKeyField.type.graphQLScalarType;
        return {
            name: getConfirmForBillingFieldName(rootEntityType.name),
            type: GraphQLBoolean,
            args: {
                [BILLING_MUTATION_INPUT_ARG]: {
                    type: inputType
                }
            },
            isSerial: true,
            description: `Confirms a ${rootEntityType.name} to be exported to billing.`,
            resolve: (_, args, info) => this.generateQueryNode(args[BILLING_MUTATION_INPUT_ARG], rootEntityType)
        };
    }

    private generateQueryNode(arg: number | string, rootEntityType: RootEntityType) {
        const entityIdQueryNode = new LiteralQueryNode(arg);
        const keyFieldVariableQueryNode = new VariableQueryNode();
        return new WithPreExecutionQueryNode({
            preExecQueries: [
                this.getExistancePreExecQueryParms(rootEntityType, entityIdQueryNode, keyFieldVariableQueryNode),
                new PreExecQueryParms({
                    query: this.getEmptyUpdateQueryNode(rootEntityType, entityIdQueryNode)
                }),
                new PreExecQueryParms({
                    query: new ConfirmForBillingQueryNode(keyFieldVariableQueryNode, rootEntityType.name)
                })
            ],
            resultNode: new LiteralQueryNode(true)
        });
    }

    private getEmptyUpdateQueryNode(rootEntityType: RootEntityType, entityIdQueryNode: LiteralQueryNode) {
        const itemVariableNode = new VariableQueryNode();
        return new UpdateEntitiesQueryNode({
            rootEntityType,
            updates: [],
            listNode: new TransformListQueryNode({
                listNode: new EntitiesQueryNode(rootEntityType),
                filterNode: new BinaryOperationQueryNode(
                    new RootEntityIDQueryNode(itemVariableNode),
                    BinaryOperator.EQUAL,
                    entityIdQueryNode
                ),
                itemVariable: itemVariableNode
            }),
            affectedFields: []
        });
    }

    private getExistancePreExecQueryParms(
        rootEntityType: RootEntityType,
        entityIdQueryNode: LiteralQueryNode,
        keyFieldVariableQueryNode: VariableQueryNode
    ) {
        if (!rootEntityType.billingEntityConfig || !rootEntityType.billingEntityConfig.billingKeyField) {
            throw new Error('RootEntityType does not have a billing-keyField'); // MSF TODO: proper error message
        }
        const itemVariableNode = new VariableQueryNode();
        return new PreExecQueryParms({
            query: new FieldQueryNode(
                new FirstOfListQueryNode(
                    new TransformListQueryNode({
                        maxCount: 1,
                        itemVariable: itemVariableNode,
                        filterNode: this.getExistanceConditionQueryNode(
                            entityIdQueryNode,
                            rootEntityType,
                            itemVariableNode
                        ),
                        listNode: new EntitiesQueryNode(rootEntityType)
                    })
                ),
                rootEntityType.billingEntityConfig.billingKeyField
            ),
            resultVariable: keyFieldVariableQueryNode,
            resultValidator: new ErrorIfNotTruthyResultValidator({
                errorCode: 'XY',
                errorMessage: 'No entity with provided id found.'
            }) // MSF TODO: proper error message
        });
    }

    private getExistanceConditionQueryNode(
        entityIdQueryNode: LiteralQueryNode,
        rootEntityType: RootEntityType,
        variable: VariableQueryNode
    ): QueryNode {
        if (!rootEntityType.billingEntityConfig || !rootEntityType.billingEntityConfig.billingKeyField) {
            throw new Error('RootEntityType does not have a billing-keyField'); // MSF TODO: proper error message
        }

        return new BinaryOperationQueryNode(
            new RootEntityIDQueryNode(variable),
            BinaryOperator.EQUAL,
            entityIdQueryNode
        );
    }
}
