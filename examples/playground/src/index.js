import React, { Component } from 'react';
import { render } from 'react-dom';
import './style.css';
import GraphiQL from 'graphiql';
import { Project, InMemoryAdapter } from 'cruddl';
import { getAQLQuery } from 'cruddl/dist/src/database/arangodb/aql-generator';
import { graphql } from 'graphql';
import AceEditor from 'react-ace';
import 'brace/mode/graphqlschema';
import 'brace/theme/chrome';
import colors from 'colors';
import ansi2html from 'ansi2html';
colors.enabled = true;

const initialSource = `type Order @rootEntity {
  orderNumber: String
	items: [OrderItem]
	deliveryAddress: Address
  paymentInfo: PaymentInfo
}

type PaymentInfo @entityExtension {
  creditCardNumber: String
}

type OrderItem @childEntity {
  itemNumber: String
	quantity: Int
}

type Address @valueObject {
  street: String
  postalCode: String
  city: String
	country: Country @reference
}

type Country @rootEntity {
	isoCode: String @key
	description: String
}`;

const initialQuery = `
mutation createOrder {
  createOrder(input: {orderNumber: "10042", items: [{itemNumber: "1", quantity: 1}, {itemNumber: "2", quantity: 3}], deliveryAddress: {street: "Main Street 1", postalCode: "70565", city: "Stuttgart"}}) {
    id
  }
}

query getOrders {
  allOrders(filter: {items_some: {quantity_gt: 1}}) {
    id
    orderNumber
    items {
      itemNumber
      quantity
    }
  }
}
`

class MockAdapter {
  async execute(queryTree) {
    this.queryTree = queryTree;
  }
  async updateSchema() {}
}

const permissionProfilesSource = JSON.stringify({
  permissionProfiles: {
    default: {
      permissions: [{
        roles: ['users'],
        access: 'readWrite'
      }]
    }
  }
});

class App extends Component {
  constructor() {
    super();
    this.state = {
      schemaSource: initialSource,
      query: initialQuery
    };
    this.db = new InMemoryAdapter();
  }

  getProject() {
    return new Project([
      {
        name: 'schema.graphqls',
        body: this.state.schemaSource
      }, {
        name: 'permission-profiles.json',
        body: permissionProfilesSource
      }
    ]);
  }

  getSchema(project) {
    if (project.validate().hasErrors()) {
      return undefined;
    }
    const schema = project.createSchema(this.db);
    this.db.updateSchema(schema);
    return schema;
  }

  fetch(params, schema) {
    return graphql(schema, params.query, {}, { authRoles: ['users'] }, params.variables, params.operationName);
  }

  updateSchemaSource(source) {
    this.setState({
      schemaSource: source
    });
  }

  updateQuery(query) {
    this.setState({
      query: query
    });
  } 

  render() {
    const project = this.getProject();
    const validation = project.validate();
    const annotations = validation.messages.map(m => ({ row: m.location.start.line - 1, column: m.location.start.column - 1, type: 'error', text: m.message }));
    const markers = [] // does not work //validation.messages.map(m => ({ startRow: m.location.start.line - 1, endRow: m.location.end.line - 1, startCol: m.location.start.column - 1, endCol: m.location.end.column - 1, className: 'error-marker', type: 'text' }));
    const schema = !validation.hasErrors() ? this.getSchema(project) : this.oldSchema;
    this.oldSchema = schema;

    const fetch = params => {
      if (!validation.hasErrors()) {
        const mockDB = new MockAdapter();
        const mockSchema = project.createSchema(mockDB);
        this.fetch(params, mockSchema).then(() => {
          if (mockDB.queryTree) {
            const aql = getAQLQuery(mockDB.queryTree);
            const str = ansi2html(aql.toColoredString()).replace(/_/g, '');
            document.getElementById('log-view').innerHTML = 'The last query would have used this AQL:\n\n' + str;
          }
        });
      } 
      return this.fetch(params, schema);
    }

    return (
      <div id="main">
        <GraphiQL fetcher={fetch} query={this.state.query} onChange={this.updateQuery.bind(this)} />

        <p></p>

        <div id="schema-editor">
          <AceEditor
            value={this.state.schemaSource}
            theme="chrome"
            height="400px"
            width="100%"
            onChange={this.updateSchemaSource.bind(this)}
            name="UNIQUE_ID_OF_DIV"
            mode="graphqlschema"
            annotations={annotations}
            markers={markers}
          />,
        </div>
        <div id="log-view">

        </div>
      </div>
    );
  }
}

setTimeout(() => {
  render(<App />, document.getElementById('root'));
}, 10); // fixes grpahiql (sometimes)

