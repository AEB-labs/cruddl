import type { DocumentNode, GraphQLSchema } from 'graphql';
import { parse, validate } from 'graphql';
import { resolve } from 'path';
import { applyAuthorizationToQueryTree } from '../../authorization/execution.js';
import { getAQLQuery } from '../../database/arangodb/aql-generator.js';
import type { DistilledOperation } from '../../graphql/query-distiller.js';
import { distillQuery } from '../../graphql/query-distiller.js';
import type { Model } from '../../model/index.js';
import type { QueryNode } from '../../query-tree/index.js';
import { ObjectQueryNode } from '../../query-tree/index.js';
import type { QueryNodeObjectType } from '../../schema-generation/index.js';
import {
    buildConditionalObjectQueryNode,
    RootTypesGenerator,
} from '../../schema-generation/index.js';
import { createRootFieldContext } from '../../schema-generation/query-node-object-type/index.js';
import { isDefined } from '../../utils/utils.js';
import type { BenchmarkConfig, BenchmarkFactories } from './support/async-bench.js';
import { createTestProject } from './support/helpers.js';

const QUERIES = [
    `{
  allDeliveries {
    id
    items {
      id
    }
    handlingUnits {
      id
      huNumber
      delivery {
        id
      }
    }
  }
}`,

    `mutation d {
  deleteDelivery(id: "15027307") {
    id
    deliveryNumber
  }
}`,

    `
mutation m {
  updateDelivery(input: {
    id: "15116232",
    addItems: [
      {
        itemNumber: "asdf"
      }
    ],
    updateItems: [
      {
        id: "2",
        itemNumber: "asdf"
      },
      {
        id: "5",
        itemNumber: "asasdfasdfdf"
      }
    ],
    removeItems: [
      "ids",
      "asdf"
    ],
    consignee: {
      street: "Sunrise Avenue"
    },
    dgInfo: {
      unNumber: "456"
    },
    removeHandlingUnits: "15149681"
  }) {
    id
    items {
      id
      itemNumber
    }
    consignee {
      street
      city
    }
    dgInfo {
      flashpoint
      unNumber
    }
  }
}
`,
];

interface PreparedQuery {
    gql: string;
    document: DocumentNode;
    distilledOperation: DistilledOperation;
    queryType: QueryNodeObjectType;
    mutationType: QueryNodeObjectType;
    queryTree: QueryNode;
    authorizedQueryTree: QueryNode;
}

function buildQueryTree({
    distilledOperation,
    queryType,
    mutationType,
}: {
    distilledOperation: DistilledOperation;
    queryType: QueryNodeObjectType;
    mutationType: QueryNodeObjectType;
}): QueryNode {
    if (distilledOperation.operation == 'mutation') {
        return buildConditionalObjectQueryNode(
            ObjectQueryNode.EMPTY,
            mutationType,
            distilledOperation.selectionSet,
            createRootFieldContext(),
        );
    } else {
        return buildConditionalObjectQueryNode(
            ObjectQueryNode.EMPTY,
            queryType,
            distilledOperation.selectionSet,
            createRootFieldContext(),
        );
    }
}

function prepareQuery(gql: string, schema: GraphQLSchema, model: Model): PreparedQuery {
    const document = parse(gql);
    validate(schema, document);
    const distilledOperation = distillQuery(document, schema, {});
    const queryType = new RootTypesGenerator().generateQueryType(model);
    const mutationType = new RootTypesGenerator().generateMutationType(model);
    const queryTree = buildQueryTree({ queryType, mutationType, distilledOperation });
    const authorizedQueryTree = applyAuthorizationToQueryTree(queryTree, { authRoles: [] });
    return {
        gql,
        document,
        distilledOperation,
        queryType,
        mutationType,
        queryTree,
        authorizedQueryTree,
    };
}

function testQueryPipeline(params: {
    parser: boolean;
    queryDistiller: boolean;
    queryTree: boolean;
    auth: boolean;
    aql: boolean;
}): BenchmarkConfig {
    const optionsStr = [
        params.parser ? 'parser' : undefined,
        params.queryDistiller ? 'query-distiller' : undefined,
        params.queryTree ? 'query-tree' : undefined,
        params.aql ? 'aql' : undefined,
        params.auth ? 'auth' : undefined,
    ]
        .filter(isDefined)
        .join(', ');

    let schema: GraphQLSchema;
    let model: Model;
    let preparedQueries: ReadonlyArray<PreparedQuery>;

    return {
        name: `Run query pipeline with ${optionsStr}`,
        isSync: true,
        initialCount: params.aql ? 10000 : 100000,
        async beforeAll() {
            const res = await createTestProject(
                resolve(__dirname, '../regression/logistics/model'),
            );
            schema = res.schema;
            model = res.project.getModel();
            preparedQueries = QUERIES.map((gql) => prepareQuery(gql, schema, model));
        },
        fn() {
            const preparedQuery =
                preparedQueries[Math.floor(Math.random() * preparedQueries.length)];
            if (params.parser) {
                parse(preparedQuery.gql);
            }
            if (params.queryDistiller) {
                distillQuery(preparedQuery.document, schema, {});
            }
            if (params.queryTree) {
                buildQueryTree(preparedQuery);
            }
            if (params.auth) {
                applyAuthorizationToQueryTree(preparedQuery.queryTree, { authRoles: [] });
            }
            if (params.aql) {
                const transaction = getAQLQuery(preparedQuery.authorizedQueryTree);
                transaction.getExecutableQueries();
            }
        },
    };
}

const benchmarks: BenchmarkFactories = [
    () =>
        testQueryPipeline({
            parser: true,
            queryDistiller: false,
            queryTree: false,
            auth: false,
            aql: false,
        }),
    () =>
        testQueryPipeline({
            parser: false,
            queryDistiller: true,
            queryTree: false,
            auth: false,
            aql: false,
        }),
    () =>
        testQueryPipeline({
            parser: false,
            queryDistiller: false,
            queryTree: true,
            auth: false,
            aql: false,
        }),
    () =>
        testQueryPipeline({
            parser: false,
            queryDistiller: false,
            queryTree: true,
            auth: true,
            aql: false,
        }),
    () =>
        testQueryPipeline({
            parser: false,
            queryDistiller: false,
            queryTree: false,
            auth: false,
            aql: true,
        }),
    () =>
        testQueryPipeline({
            parser: true,
            queryDistiller: true,
            queryTree: true,
            auth: true,
            aql: true,
        }),
];

export default benchmarks;
