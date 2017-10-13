import { BenchmarkConfig, BenchmarkFactories } from './support/async-bench';
import { DocumentNode, GraphQLSchema, parse, validate } from 'graphql';
import { createDumbSchema } from './support/helpers';
import * as path from 'path';
import { DistilledOperation, distillQuery } from '../../src/graphql/query-distiller';
import { createQueryTree } from '../../src/query/query-tree-builder';
import { getAQLForQuery } from '../../src/database/arangodb/aql-generator';
import { QueryNode } from '../../src/query/definition';
import { compact } from '../../src/utils/utils';

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
}

function prepareQuery(gql: string): PreparedQuery {
    const document = parse(gql);
    validate(schema, document);
    const distilledOperation = distillQuery(document, schema, {});
    const queryTree = createQueryTree(distilledOperation);
    return {
        gql,
        document,
        distilledOperation,
        queryTree
    };
}

const PREPARED_QUERIES = QUERIES.map(gql => prepareQuery(gql));

function testQueryPipeline(params: { parser: boolean, queryDistiller: boolean, queryTree: boolean, aql: boolean }): BenchmarkConfig {
    const optionsStr = compact([
        params.parser ? 'parser' : undefined,
        params.queryDistiller ? 'query-distiller' : undefined,
        params.queryTree ? 'query-tree' : undefined,
        params.aql ? 'aql' : undefined
    ]).join(', ');

    return {
        name: `Run query pipeline with ${optionsStr}`,
        isSync: true,
        initialCount: 100000,
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
            if (params.aql) {
                getAQLForQuery(preparedQuery.queryTree);
            }
        }
    };
}

const benchmarks: BenchmarkFactories = [
    () => testQueryPipeline({parser: true, queryDistiller: false, queryTree: false, aql: false }),
    () => testQueryPipeline({parser: false, queryDistiller: true, queryTree: false, aql: false }),
    () => testQueryPipeline({parser: false, queryDistiller: false, queryTree: true, aql: false }),
    () => testQueryPipeline({parser: false, queryDistiller: false, queryTree: false, aql: true }),
    () => testQueryPipeline({parser: true, queryDistiller: true, queryTree: true, aql: true })
];

export default benchmarks;