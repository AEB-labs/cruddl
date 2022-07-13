# GraphQL API

cruddl provides a GraphQL API to create, read, update and delete objects within the data base. The queries and mutations
are based on the user-defined schema. See the [modelling guide](./modelling.md) on how to create such a schema. This
documentation will make use of the types and fields defined in the modelling guide.

## Queries

For each root entity, three queries are available. For the root entity `Order`, these are `Order`, `allOrders` and
`_allOrdersMeta`.

Use `Order` to retrieve a specific object by id:

```graphql
query {
    Order(id: "123") {
        orderNumber
    }
}
```

Use `allOrders` to retrieve a list of orders. You can also specify filters, sorting and pagination arguments:

```graphql
query {
    allOrders(filter: { deliveryAddress: { country_in: ["DE", "UK"] } }, orderBy: orderNumber_ASC, first: 5) {
        orderNumber
        _cursor
    }
}
```

To paginate, query the `_cursor` field and use it as the value for the `after` argument to retrieve the next page.

Use `_allOrdersMeta` to query the number of objects. You can also specify a filter here.

```graphql
query {
    _allOrdersMeta(filter: { deliveryAddress: { country_in: ["DE", "UK"] } }) {
        count
    }
}
```

### Selections

You can navigate into any object type in arbitrary depth.

```graphql
query {
    Order(id: "123") {
        items {
            # child entities
            itemNumber
        }
        shipmentAddress {
            # value objects
            city
            country {
                # references
                description
            }
        }
        customer {
            # relations
            name: String
        }
        paymentInfo {
            # entity extensions
            creditCardNumber
        }
    }
}
```

### Filters

An entity can be filtered by all own fields and fields of nested/related entites of cardinality one. For to-n relations
and other lists, there are the quantifiers `some`, `every`, `none`. (SQL WHERE EXISTS ...). Take care when using
quantifiers as they can significantly hit performance due to poor optimization in Arango, especially when dealing with
large collections.

Sibling filter fields are always combined using _AND_. Use the special fields `AND` and `OR` for complex filters.

If you specify an empty object (`{}`) as a filter value, it matches all documents. You can combine this with the
quantifier fields to e.g. find out whether a list is empty (`items_none: {}`) or is not empty (`items_some: {}`).

## Sorting

Results can be sorted by all fields of the rootEntity including fields from nested/related objects with a cardinality of
one.

## Mutations

For each root entity, three mutations are available. For the root entity `Order`, these are `createOrder`, `updateOrder`
and `deleteOrder`.

### Create

Create a new object using the create\* mutation.

```graphql
mutation {
    createOrder(input: { orderNumber: "1000123" }) {
        id
        orderNumber
    }
}
```

This mutation creates an order with the orderNumber "1000123". The ID will be auto-generated and cannot be set manually
(thus is not part of the input type). The created object can be queried as described above.

### Update

Update an existing object using the update\* mutation.

```graphql
mutation {
    updateOrder(input: { id: "42", paymentInfo: { creditCardNumber: "123-xxx" } }) {
        id
    }
}
```

This mutation updates the order with the id "42" and sets its payment info. The updated object can be queried as
described above.

## Delete

Delete an existing object using the delete\* mutation.

```graphql
mutation {
    deleteOrder(id: "42") {
        id
    }
}
```

This mutation deletes the person with the id "42". Currently, this allows to query the deleted object, but not across
root entity boundaries. This API is likely to change in the future.
