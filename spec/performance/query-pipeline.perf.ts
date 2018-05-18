import { BenchmarkConfig, BenchmarkFactories } from './support/async-bench';
import { DocumentNode, GraphQLSchema, parse, validate } from 'graphql';
import * as path from 'path';
import { DistilledOperation, distillQuery } from '../../src/graphql/query-distiller';
import { createQueryTree } from '../../src/query/query-tree-builder';
import { getAQLQuery } from '../../src/database/arangodb/aql-generator';
import { QueryNode } from '../../src/query/definition';
import { compact } from '../../src/utils/utils';
import { applyAuthorizationToQueryTree } from '../../src/authorization/execution';
import { Project } from '../../src/project/project';
import { createTestProject } from './support/helpers';
import { Model } from '../../src/model';

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
`
];

interface PreparedQuery {
    gql: string;
    document: DocumentNode;
    distilledOperation: DistilledOperation;
    queryTree: QueryNode;
    authorizedQueryTree: QueryNode;
}

function prepareQuery(gql: string, schema: GraphQLSchema, model: Model): PreparedQuery {
    const document = parse(gql);
    validate(schema, document);
    const distilledOperation = distillQuery(document, schema, {});
    const queryTree = createQueryTree(distilledOperation, model);
    const authorizedQueryTree = applyAuthorizationToQueryTree(queryTree,  { authRoles: []});
    return {
        gql,
        document,
        distilledOperation,
        queryTree,
        authorizedQueryTree
    };
}

function testQueryPipeline(params: { parser: boolean, queryDistiller: boolean, queryTree: boolean, auth: boolean, aql: boolean }): BenchmarkConfig {
    const optionsStr = compact([
        params.parser ? 'parser' : undefined,
        params.queryDistiller ? 'query-distiller' : undefined,
        params.queryTree ? 'query-tree' : undefined,
        params.aql ? 'aql' : undefined
    ]).join(', ');

    let schema: GraphQLSchema;
    let model: Model;
    let preparedQueries: PreparedQuery[];

    return {
        name: `Run query pipeline with ${optionsStr}`,
        isSync: true,
        initialCount: params.aql ? 10000 : 100000,
        async beforeAll() {
            const res = await createTestProject(path.resolve(__dirname, '../regression/logistics/model'));
            schema = res.schema;
            model = res.project.getModel();
            preparedQueries = QUERIES.map(gql => prepareQuery(gql, schema, model));
        },
        fn() {
            const preparedQuery = preparedQueries[Math.floor(Math.random() * preparedQueries.length)];
            if (params.parser) {
                parse(preparedQuery.gql)
            }
            if (params.queryDistiller) {
                distillQuery(preparedQuery.document, schema, {});
            }
            if (params.queryTree) {
                createQueryTree(preparedQuery.distilledOperation, model);
            }
            if (params.auth) {
                applyAuthorizationToQueryTree(preparedQuery.queryTree, { authRoles: []});
            }
            if (params.aql) {
                const transaction = getAQLQuery(preparedQuery.authorizedQueryTree);
                transaction.getExecutableQueries();
            }
        }
    };
}

const benchmarks: BenchmarkFactories = [
    () => testQueryPipeline({parser: true, queryDistiller: false, queryTree: false, auth: false, aql: false }),
    () => testQueryPipeline({parser: false, queryDistiller: true, queryTree: false, auth: false, aql: false }),
    () => testQueryPipeline({parser: false, queryDistiller: false, queryTree: true, auth: false, aql: false }),
    () => testQueryPipeline({parser: false, queryDistiller: false, queryTree: true, auth: true, aql: false }),
    () => testQueryPipeline({parser: false, queryDistiller: false, queryTree: false, auth: false, aql: true }),
    () => testQueryPipeline({parser: true, queryDistiller: true, queryTree: true, auth: true, aql: true })
];

export default benchmarks;