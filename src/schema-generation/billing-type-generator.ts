import { GraphQLBoolean } from 'graphql';
import memorize from 'memorize-decorator';
import { RootEntityType } from '../model/implementation';
import {
    BILLING_KEYFIELD_NOT_FILLED_ERROR,
    BinaryOperationQueryNode,
    BinaryOperator,
    ConfirmForBillingQueryNode,
    EntitiesQueryNode,
    ErrorIfNotTruthyResultValidator,
    FieldQueryNode,
    FirstOfListQueryNode,
    LiteralQueryNode,
    NOT_FOUND_ERROR,
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
            throw new Error('The BillingKeyField must be a scalar field.');
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
                this.getExistancePreExecQueryParms(rootEntityType, entityIdQueryNode),
                this.getKeyfieldPreExecQueryParms(rootEntityType, entityIdQueryNode, keyFieldVariableQueryNode),
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

    private getKeyfieldPreExecQueryParms(
        rootEntityType: RootEntityType,
        entityIdQueryNode: LiteralQueryNode,
        keyFieldVariableQueryNode: VariableQueryNode
    ) {
        if (!rootEntityType.billingEntityConfig || !rootEntityType.billingEntityConfig.billingKeyField) {
            throw this.getKeyFieldNotFilledError(rootEntityType);
        }
        const itemVariableNode = new VariableQueryNode();
        return new PreExecQueryParms({
            query: new FieldQueryNode(
                this.getRootEntityQueryNode(itemVariableNode, entityIdQueryNode, rootEntityType),
                rootEntityType.billingEntityConfig.billingKeyField
            ),
            resultVariable: keyFieldVariableQueryNode,
            resultValidator: new ErrorIfNotTruthyResultValidator({
                errorCode: BILLING_KEYFIELD_NOT_FILLED_ERROR,
                errorMessage: `The keyfield ${rootEntityType.billingEntityConfig.billingKeyField.name} with id ${entityIdQueryNode.value} is not filled.`
            })
        });
    }

    private getExistancePreExecQueryParms(rootEntityType: RootEntityType, entityIdQueryNode: LiteralQueryNode) {
        const itemVariableNode = new VariableQueryNode();
        return new PreExecQueryParms({
            query: this.getRootEntityQueryNode(itemVariableNode, entityIdQueryNode, rootEntityType),
            resultValidator: new ErrorIfNotTruthyResultValidator({
                errorCode: NOT_FOUND_ERROR,
                errorMessage: `No ${rootEntityType.name} with id ${entityIdQueryNode.value} found.`
            })
        });
    }

    private getKeyFieldNotFilledError(rootEntityType: RootEntityType) {
        return new Error(`The RootEntityType "${rootEntityType.name}" does not have a billing-keyField.`);
    }

    private getRootEntityQueryNode(
        itemVariableNode: VariableQueryNode,
        entityIdQueryNode: LiteralQueryNode,
        rootEntityType: RootEntityType
    ) {
        return new FirstOfListQueryNode(
            new TransformListQueryNode({
                maxCount: 1,
                itemVariable: itemVariableNode,
                filterNode: this.getExistanceConditionQueryNode(entityIdQueryNode, rootEntityType, itemVariableNode),
                listNode: new EntitiesQueryNode(rootEntityType)
            })
        );
    }

    private getExistanceConditionQueryNode(
        entityIdQueryNode: LiteralQueryNode,
        rootEntityType: RootEntityType,
        variable: VariableQueryNode
    ): QueryNode {
        if (!rootEntityType.billingEntityConfig || !rootEntityType.billingEntityConfig.billingKeyField) {
            throw this.getKeyFieldNotFilledError(rootEntityType);
        }

        return new BinaryOperationQueryNode(
            new RootEntityIDQueryNode(variable),
            BinaryOperator.EQUAL,
            entityIdQueryNode
        );
    }
}
