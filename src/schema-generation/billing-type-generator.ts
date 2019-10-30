import { GraphQLBoolean, GraphQLInputFieldConfig, GraphQLInputObjectType } from 'graphql';
import memorize from 'memorize-decorator';
import { RootEntityType } from '../model/implementation';
import { ConfirmForBillingQueryNode, CreateBillingEntityQueryNode, LiteralQueryNode, PreExecQueryParms, QueryNode, VariableQueryNode, WithPreExecutionQueryNode } from '../query-tree';
import { BILLING_MUTATION_INPUT_ARG, MUTATION_INPUT_ARG } from '../schema/constants';
import { getConfirmForBillingFieldName } from '../schema/names';
import { OutputTypeGenerator } from './output-type-generator';
import { makeNonNullableList, QueryNodeField, QueryNodeNonNullType, QueryNodeResolveInfo } from './query-node-object-type';

export class BillingTypeGenerator {

    constructor(readonly outputTypeGenerator: OutputTypeGenerator) {

    }

    @memorize()
    getMutationField(rootEntityType: RootEntityType): QueryNodeField | undefined {
        if (!rootEntityType.billingEntityConfig || !rootEntityType.billingEntityConfig.billingKeyField) {
            return undefined;
        }
        if (!rootEntityType.billingEntityConfig.billingKeyField.type.isScalarType) {
            throw new Error('The BillingKeyField must');
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
                new PreExecQueryParms({
                    query: new ConfirmForBillingQueryNode(arg, rootEntityType.name)
                })
            ],
            resultNode: new LiteralQueryNode(true)
        });
    }
}
