# Modelling guide

A cruddl project consists of one or multiple [GraphQL schema](http://graphql.org/learn/schema/) files and, optionally, metadata files in JSON format. A simple example can look like this:

```typescript
import { Project } from 'cruddl';
const project = new Project([{
  name: 'schema.graphqls',
  body: `
        type Order @rootEntity {
          orderNumber: String
        }
    `
}, {
  name: 'permission-profiles.json',
  body: JSON.stringify({
    permissionProfiles: {
      default: {
        permissions: [{
          roles: ['users'],
          access: 'readWrite'
        }]
      }
    }
  })
}]);
```

The file `schema.graphqls` contains type definitions while `permission-profiles.json` provides metadata (in this case, to grant unrestricted access users with the "users" role). The two file formats are distinguished by the extension of the `name`.

In this example, we define one type `Order` with a scalar field. This project already allows to create, update, delete and read `Order` objects. See the [api documentation](api.md) on how the queries and mutations look like.

## Four kinds of object types

In the example above, `Order` is decorated with the `@rootEntity` directive, which distinguishes it from the other kinds of type definitions: `@childEntity`, `@entityExtension` and `@valueObject`. We use this to map the features of a document database to the world of GraphQL.

### Root entities

Root entity types are the equivalent of documents in a document database. They have an implicit, auto-generated `id` field that identifies a root entity uniquely and is used to update and delete existing root entities. All queries and mutations start on root entities - all other kinds of objects are only accessible via their parent root entity.

```graphql

type Order @rootEntity {
  orderNumber: String
}
```

When updating root entities and you specify only a subset of its fields, the other fields are not touched.

### Child entities

Child entities behave like collections within root entities. They also have an auto-generated `id` field and it is possible to create, update and delete individual child entities. In contrast to root entities, child entities are embedded within a root entity, another child entity or an entity extension. A `@childEntity` type can also only be used within a list type.

```graphql
type OrderItem @childEntity {
  itemNumber: String
  quantity: Int
}
 
type Order @rootEntity {
  # ...
  items: [OrderItem]
}
```

As with root entities, if you omit fields when updating a child entity, those are kept as-is.

### Entity extensions

Child entity types can only be used within list types. To group a set of fields into a single object within an entity, use entity extensions.

```graphql
type PaymentInfo @entityExtension {
  creditCardNumber: String
  payPalToken: String
}

type Order @rootEntity {
  # ...
  paymentInfo: PaymentInfo
}
```

Entity extension can be used within root entities, child entities and other entity extensions. If you omit fields when updating an entity extension, those are kept as-is. Entity extensions are never `null` - if you omit it entirely, or an object was created before it was added, the field evaluates to an empty object.

### Value objects

Value objects are treated as atomic values much like scalars are. They can not be partially updated but are replaced completely on updates. If you omit fields on update, they are set to `null`. This is useful for types like addresses. They can also be used within lists.

```graphql
type Address @valueObject {
  street: String
  postalCode: String
  city: String
}

type Order @rootEntity {
  # ...
  shippingAddress: Address
}
```

Value object types are the most basic kinds of types and can only have fields of scalar, enum or value object type.

## Linking objects

### Relations

Relations define links between root entities. Use the `@relation` directive to define the forward link and `@relation(inverseOf: "otherFieldName")` for the back link.

```graphql
type Order @rootEntity {
  # ...
  customer: Customer @relation
}

type Customer @rootEntity {
  name: String
  orders: [Order] @relation(inverseOf: "customer")
}
```

The back link can be omitted. If you however only omit the `inverseOf` argument on the back link, this creates two independent relations - one from customers to orders, and one from orders to customers. The cardinality of relations is determined by the field types. In this case, `customer` is of type `Customer`, but the inverse field - `orders` has a list type, resulting in a *n-to-1* relation from orders to customers.

In ArangoDB, relations are stored in an edge collection with the name ```orders_customer``` (the plural of the source object combined with the field name).

### References

References allow to link to a root entity from any field, not only from another root entity. In contrast to relations, it is however not possible to navigate from the referenced object to the referencing object.

In order to define a reference, the referenced type first needs to declare a key field. The value of this key field is stored in the reference field. Within queries, this key value is used to look up the referenced object.

```graphql
type Country @rootEntity {
  isoCode: String @key
  name: String
}

type Address @valueObject {
  # ...
  country: Country @reference
}
```

References can not be used on list types. Use an intermediate value object instead.

## Permissions

cruddl provides a role-based permission system. Permission rules can be defined on root entities and on fields. For root entities, the permissions can also be made dependent on a special field within the object to implement multi-tenancy.

Currently, there are two ways to specify permissions: Via the `@roles` directive or via permission profiles. The `@roles` directive will be deprecated in the future, but currently it is needed for field-based permissions.

The basic example above already specified a permission profile `default` which is  applied to all root entities without an explicit `permissionProfile` argument in the `@rootEntity` directive:

```json
{
  "permissionProfiles": {
    "default": {
      "permissions": [{
        "roles": ["users"],
        "access": "readWrite"
      }]
    }
  }
}
```

This profile grants unrestricted access for the "users" role. The roles of a user are take from the `authContext` property on the GraphQL context. The following permission profile "restricted" allows read access to all roles starting with "user" and provides full access to the role "admin":

```json
{
  "permissionProfiles": {
    "restricted": {
      "permissions": [{
        "roles": ["admin"],
        "access": "readWrite"
      }, {
        "roles": ["user*"],
        "access": "read"
      }]
    }
  }
}
```

You can use this profile as follows:

```graphql
type Order @rootEntity(permissionProfile: "restricted") {
  # ...
}
```

### Field permissions

To set permissions on individual fields, you need to use the `@roles` directive. This will be changed in the future to also work with permission profiles.

```graphql
type Customer @rootEntity {
  paymentInfo: PaymentInfo @roles(readWrite: ["support-privileged"], read: [])
}
```


### Data-dependent permissions

Use `restrictToAccessGroups` for a data-dependent permission profile:
 grants unrestricted access for all roles. The following permission profile "restricted" allows read access to all roles starting with "user" and provides full access to the role "admin":

```json
{
  "permissionProfiles": {
    "restricted": {
      "permissions": [{
        "roles": ["admin"],
        "access": "readWrite"
      }, {
        "roles": ["support-europe"],
        "access": "read",
        "restrictToAccessGroups": [ "EUROPE" ]
      }, {
        "roles": ["support-america"],
        "access": "read",
        "restrictToAccessGroups": [ "NORTH_AMERICA", "SOUTH_AMERICA" ]
      }]
    }
  }
}
```

You can use this profile as follows:

```graphql
type Order @rootEntity(permissionProfile: "restricted") {
  # ...
  accessGroup: OrderAccessGroup
}

enum OrderAccessGroup {
  EUROPE, NORTH_AMERICA, SOUTH_AMERICA, RESTRICTED
}
```

* Users with role "admin" can access all orders.
* Users with role "support-europe" can only access orders where `accessGroup` has the value "EUROPE".
* Users with role "support-america" can only access orders where `accessGroup` has the value "NORTH_AMERICA" or "SOUTH_AMERICA".
* Users with role "support-america" and "support-europe" can only access orders where `accessGroup` has the value "EUROPE", "NORTH_AMERICA", or "SOUTH_AMERICA".

## Indices

cruddl supports index handling. During start up they are extracted from the schema and created or removed from the database.

### Root entity index definition

Indices can be added to the `@rootEntity` directive:

```graphql
type Order @rootEntity(indices: [{ fields: ["orderNumber"], unique: true}, { fields: [ "shippingAddress.country", "shippingAddress.postalCode"] }]) {
    # ...
}
```

### Field index definition

Indices can also be directly attached to fields. Multi-field indices are not supported via field definition.

```graphql
type Order @rootEntity {
  orderNumber: String @unique
  trackingNumber: String @index
  # ...
}
```

## Predefined types

## DateTime

`DateTime` is a scalar that holds a ISO-8601-encoded date/time string.

## JSON

The scalar `JSON` can hold any JSON value. In ArangoDB, it is not stored in serialized form but as its actual value.

## System fields

Root entities and child entities have the implicit fields `id`, `createdAt` and `updatedAt` (the latter two of type `DateTime`). They are managed by cruddl and can not be overwritten.
