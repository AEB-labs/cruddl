import { BenchmarkConfig, BenchmarkFactories } from './support/async-bench';
import { DocumentNode, parse, validate } from 'graphql';
import { createDumbSchema } from './support/helpers';
import * as path from 'path';
import { DistilledOperation, distillQuery } from '../../src/graphql/query-distiller';
import { createQueryTree } from '../../src/query/query-tree-builder';
import { getAQLQuery } from '../../src/database/arangodb/aql-generator';
import { QueryNode } from '../../src/query/definition';
import { compact } from '../../src/utils/utils';
import { applyAuthorizationToQueryTree } from '../../src/authorization/execution';

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

const schema = createDumbSchema(path.resolve(__dirname, '../regression/logistics/model'));

interface PreparedQuery {
    gql: string;
    document: DocumentNode;
    distilledOperation: DistilledOperation;
    queryTree: QueryNode;
    authorizedQueryTree: QueryNode;
}

function prepareQuery(gql: string): PreparedQuery {
    const document = parse(gql);
    validate(schema, document);
    const distilledOperation = distillQuery(document, schema, {});
    const queryTree = createQueryTree(distilledOperation);
    const authorizedQueryTree = applyAuthorizationToQueryTree(queryTree,  { authRoles: []});
    return {
        gql,
        document,
        distilledOperation,
        queryTree,
        authorizedQueryTree
    };
}

const PREPARED_QUERIES = QUERIES.map(gql => prepareQuery(gql));

function testQueryPipeline(params: { parser: boolean, queryDistiller: boolean, queryTree: boolean, auth: boolean, aql: boolean }): BenchmarkConfig {
    const optionsStr = compact([
        params.parser ? 'parser' : undefined,
        params.queryDistiller ? 'query-distiller' : undefined,
        params.queryTree ? 'query-tree' : undefined,
        params.aql ? 'aql' : undefined
    ]).join(', ');

    return {
        name: `Run query pipeline with ${optionsStr}`,
        isSync: true,
        initialCount: params.aql ? 10000 : 100000,
        fn() {
            const preparedQuery = PREPARED_QUERIES[Math.floor(Math.random() * PREPARED_QUERIES.length)];
            if (params.parser) {
                parse(preparedQuery.gql)
            }
            if (params.queryDistiller) {
                distillQuery(preparedQuery.document, schema, {});
            }
            if (params.queryTree) {
                createQueryTree(preparedQuery.distilledOperation);
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