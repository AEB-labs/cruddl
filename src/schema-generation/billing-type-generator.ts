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
        return new WithPreExecutionQueryNode({
            preExecQueries: [
                this.getExistancePreExecQueryParms(arg, rootEntityType),
                new PreExecQueryParms({
                    query: new ConfirmForBillingQueryNode(arg, rootEntityType.name)
                })
            ],
            resultNode: new LiteralQueryNode(true)
        });
    }

    private getExistancePreExecQueryParms(arg: number | string, rootEntityType: RootEntityType) {
        const variable = new VariableQueryNode();
        return new PreExecQueryParms({
            query: new RootEntityIDQueryNode(
                new FirstOfListQueryNode(
                    new TransformListQueryNode({
                        maxCount: 1,
                        itemVariable: variable,
                        filterNode: this.getExistanceConditionQueryNode(arg, rootEntityType, variable),
                        listNode: new EntitiesQueryNode(rootEntityType)
                    })
                )
            ),
            resultValidator: new ErrorIfNotTruthyResultValidator({
                errorCode: 'XY',
                errorMessage: 'No entity with provided key found.'
            }) // MSF TODO: proper error message
        });
    }

    private getExistanceConditionQueryNode(
        arg: number | string,
        rootEntityType: RootEntityType,
        variable: VariableQueryNode
    ): QueryNode {
        if (!rootEntityType.billingEntityConfig || !rootEntityType.billingEntityConfig.billingKeyField) {
            throw new Error('RootEntityType does not have a keyField'); // MSF TODO: proper error message
        }

        return new BinaryOperationQueryNode(
            new FieldQueryNode(variable, rootEntityType.billingEntityConfig.billingKeyField),
            BinaryOperator.EQUAL,
            new LiteralQueryNode(arg)
        );
    }
}
