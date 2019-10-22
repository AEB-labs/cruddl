
1. install arangodb. ie. `brew install arangodb`
2. `npm i`
3. `npm run start_arango`
4. open Arango console at http://localhost:8529
5. create a fresh database called 'test'
6. `npm start`
7. open a browser to http://localhost:4000 and use some of the queries below

After a few seconds, you should see the following on the console

```
Server is running on http://localhost:4000/
ArangoDBAdapter: ArangoDB version: 3.5.0. Workaround for sparse indices will not be enabled.
ArangoDBAdapter: Performing migration "create document collection orders"
ArangoDBAdapter: Successfully performed migration "create document collection orders"
ArangoDBAdapter: Performing migration "create document collection countries"
ArangoDBAdapter: Successfully performed migration "create document collection countries"
ArangoDBAdapter: Performing migration "create persistent index on collection orders on field '_key'"
ArangoDBAdapter: Successfully performed migration "create persistent index on collection orders on field '_key'"
ArangoDBAdapter: Performing migration "create unique sparse persistent index on collection countries on field 'isoCode'"
ArangoDBAdapter: Successfully performed migration "create unique sparse persistent index on collection countries on field 'isoCode'"
ArangoDBAdapter: Performing migration "create persistent index on collection countries on field '_key'"
ArangoDBAdapter: Successfully performed migration "create persistent index on collection countries on field '_key'"
```


Run the following query multiple times, now how the **id** is always the same
```
mutation {
  createCountry(input:{
    isoCode:"FR"
    description:"france"
  }) {
    id
  }
}

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
```