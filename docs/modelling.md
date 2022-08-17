# Modelling guide

A cruddl project consists of one or multiple [GraphQL schema](http://graphql.org/learn/schema/) files and, optionally,
metadata files in JSON or YAML format. A simple example can look like this:

```typescript
import { Project } from 'cruddl';

const project = new Project([
    {
        name: 'schema.graphqls',
        body: `
        type Order @rootEntity {
          orderNumber: String
        }
    `,
    },
    {
        name: 'permission-profiles.json',
        body: JSON.stringify({
            permissionProfiles: {
                default: {
                    permissions: [
                        {
                            roles: ['users'],
                            access: 'readWrite',
                        },
                    ],
                },
            },
        }),
    },
]);
```

The file `schema.graphqls` contains type definitions while `permission-profiles.json` provides metadata (in this case,
to grant unrestricted access users with the "users" role). The two file formats are distinguished by the extension of
the `name`.

In this example, we define one type `Order` with a scalar field. This project already allows to create, update, delete
and read `Order` objects. See the [api documentation](api.md) on how the queries and mutations look like.

## Four kinds of object types

In the example above, `Order` is decorated with the `@rootEntity` directive, which distinguishes it from the other kinds
of type definitions: `@childEntity`, `@entityExtension` and `@valueObject`. We use this to map the features of a
document database to the world of GraphQL.

### Root entities

Root entity types are the equivalent of documents in a document database. They have an implicit, auto-generated `id`
field that identifies a root entity uniquely and is used to update and delete existing root entities. All queries and
mutations start on root entities - all other kinds of objects are only accessible via their parent root entity.

```graphql
type Order @rootEntity {
    orderNumber: String
}
```

When updating root entities and you specify only a subset of its fields, the other fields are not touched.

### Child entities

Child entities behave like collections within root entities. They also have an auto-generated `id` field and it is
possible to create, update and delete individual child entities. In contrast to root entities, child entities are
embedded within a root entity, another child entity or an entity extension. A `@childEntity` type can also only be used
within a list type.

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

Child entity types can only be used within list types. To group a set of fields into a single object within an entity,
use entity extensions.

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

Entity extension can be used within root entities, child entities and other entity extensions. If you omit fields when
updating an entity extension, those are kept as-is. Entity extensions are never `null` - if you omit it entirely, or an
object was created before it was added, the field evaluates to an empty object.

### Value objects

Value objects are treated as atomic values much like scalars are. They cannot be partially updated but are replaced
completely on updates. If you omit fields on update, they are set to `null`. This is useful for types like addresses.
They can also be used within lists.

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

Relations define links between root entities. Use the `@relation` directive to define the forward link and
`@relation(inverseOf: "otherFieldName")` for the back link.

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

The back link can be omitted. If you however only omit the `inverseOf` argument on the back link, this creates two
independent relations - one from customers to orders, and one from orders to customers. The cardinality of relations is
determined by the field types. In this case, `customer` is of type `Customer`, but the inverse field - `orders` has a
list type, resulting in a _n-to-1_ relation from orders to customers.

In ArangoDB, relations are stored in an edge collection with the name `orders_customer` (the plural of the source object
combined with the field name).

### onDelete actions

When a root entity is deleted, all related edges are deleted as well, but the related objects are left untouched.
Forward relations (`@relation` without an `inverseOf` argument) can specify the `onDelete` argument to change this
default behavior.

If `onDelete: RESTRICT` is configured, deletion is prevented if there are still objects linked with this relation. The
related objects or the relations need to be deleted before the object can be deleted. This can either be done in its own
operation or as a separate mutation field in the same operation that comes before the delete mutation field. On
self-recursive relations (e.g. to child objects of the same type), you can also specify the parent and child ids in one
`deleteObjects` or `deleteAllObjects` mutation.

If `onDelete: CASCADE` is configured, objects in this relation will be deleted alongside the object itself. If the
related object has relations with `onDelete: CASCADE`, those will be deleted as well. This mode cannot be used
recursively; it is a validation error in the model if a recursion is detected. It also can only be used on 1-to-n and
m-to-n relations.

### References

References allow to link to a root entity from any field, not only from another root entity. In contrast to relations,
it is however not possible to navigate from the referenced object to the referencing object.

References are built from regular scalar fields that hold key, e.g. `countryISOCode` of type `String`. To upgrade this
to a reference, you need to define a referenced root entity with a dedicated key field (e.g. `Country.isoCode`), and
then use `@reference` to link them:

```graphql
type Country @rootEntity {
    isoCode: String @key
    name: String
}

type Address @valueObject {
    # ...
    countryISOCode: String
    country: Country @reference(keyField: "countryISOCode")
}
```

In the data base, only `countryISOCode` will be stored, and you can use the field in normal way (setting, updating,
filtering, sorting querying), In addition, you will be able to query the field `country`:

```graphql
{
    Company(name: "AEB") {
        address {
            countryISOCode
            country {
                isoCode
                name
            }
        }
    }
}
```

The referenced country will be looked on demand. If the referenced object does not exist, it will be `null` ( though
`countryISOCode` will still result in its value). You can think of references as more of an API feature than a modelling
feature.

You can omit the argument `keyField` on the `@reference` directive (and this argument has only been introduced in cruddl
0.9). In that case, you won't have access to the raw key field value via the API. In the data base, it will be stored
with the name of the reference field.

## Collect fields

With the `@collect` directive, you can define fields that are not persisted but rather compute their value when queried,
based on other fields. It allows you to follow a path of relations, child entities and other fields, collect these
values and optionally apply aggregations on them.

### Basics

You can use `@collect` to follow two relations and collect all inner entities:

```graphql
type OrderItem @childEntity {
    itemNumber: String
}

type Order @rootEntity {
    items: [OrderItem]
}

type Shipment @rootEntity {
    orders: [Order] @relation
    allItems: [OrderItem] @collect(path: "orders.items")
}
```

The field `allItems` will return all items in all orders of a shipment. It will not be available for filtering or
sorting and you will not be able to set it directly in _create_ and _update_ mutations.

The path can traverse an arbitrary number of fields. Only the objects of the _last_ field will be returned, and the type
of that last field needs to match the traversal field type (`OrderItem` in the example). References cannot yet be
followed, but you can use other traversal fields in the path.

### Flattening tree structure

If you have a root entity with a relation to itself, you can use a collect field to flatten the tree:

```graphql
type HandlingUnit {
    childHandlingUnits: [HandlingUnit] @relation
    parentHandlingUnit: HandlingUnit @relation(inverseOf: "childHandlingUnits")

    allInnerHandlingUnits: [HandlingUnit] @collect(path: "childHandlingUnits{1,3}")
}
```

The field `allInnerHandlingUnits` will result in the direct children, their children, and their children (by default, in
depth-first order). The first number (`1`) is the minimum depth (which can also be `0` to include the originating
entity), and the second number (`3`) is the maximum depth. If you omit the maximum depth, the minimum depth will be used
as maximum depth. It's not possible to entirely omit the maximum depth.

The minimum and maximum depth can only be specified on directly recursive relations. It is not possible to cycle through
indirectly recursive relations, and child entities don't support this feature at all.

### Null values

If you follow a field that can be null (e.g. a to-1 relation or a simple scalar field), the collection may include
`null` values. However, it is not allowed to define a list field that could include `null` values. Therefore, you need
to define an aggregation, e.g. `DISTINCT` to remove null values.

If you follow a list field on an object that is null (e.g. `order.orderItems` if `order` is null), this null object just
won't contribute any items. The resulting list will not include `null` in this case.

### Collecting scalar values

A collect path can also end in a scalar field. This however requires the use of an aggregator (see next section). Use
the aggregator `DISTINCT` if you are interested in the individual field values (see next section).

### Aggregating values

With the optional `aggregate` argument, you can perform an aggregation on all collected items. For example, this allows
you to sum up numbers:

```graphql
type OrderItem @childEntity {
    itemNumber: String
    quantity: Int
}

type Order @rootEntity {
    items: [OrderItem]
    totalQuantity: Int @collect(path: "items.quantity", aggregate: SUM)
}
```

The path can use all the features from above and also use other `@collect` fields (but not nested aggregations at the
moment).

The following operators are supported:

| Operator         | Description                                      | Supported Types                                      | Null values     | Result on empty list |
| ---------------- | ------------------------------------------------ | ---------------------------------------------------- | --------------- | -------------------- |
| `COUNT`          | Total number of items (including `null`)         | all types (last segment must be a list)              | included        | `0`                  |
| `SOME`           | `true` if there are any items (including `null`) | all types (last segment must be a list)              | included        | `false`              |
| `NONE`           | `true` if the list is empty                      | all types (last segment must be a list)              | included        | `true`               |
| **None**         |                                                  |                                                      |                 |                      |
| `COUNT_NULL`     | Number of items that are `null`                  | all nullable types                                   | see description | `0`                  |
| `COUNT_NOT_NULL` | Number of items that are not `null`              | all nullable types                                   | see description | `0`                  |
| `SOME_NULL`      | `true` if there are items that are `null`        | all nullable types                                   | see description | `false`              |
| `SOME_NOT_NULL`  | `true` if there are items that are not `null`    | all nullable types                                   | see description | `false`              |
| `EVERY_NULL`     | `true` if there are no items that are not `null` | all nullable types                                   | see description | `true`               |
| `NONE_NULL`      | `true` if there are no items that are `null`     | all nullable types                                   | see description | `true`               |
| **Numbers**      |                                                  |                                                      |                 |                      |
| `MIN`            | Minimum value (ignoring `null`)                  | `Int`, `Float`, `DateTime`, `LocalDate`, `LocalTime` | excluded        | `null`               |
| `MAX`            | Maximum value (ignoring `null`)                  | `Int`, `Float`, `DateTime`, `LocalDate`, `LocalTime` | excluded        | `null`               |
| `SUM`            | Sum (ignoring `null`)                            | `Int`, `Float`                                       | excluded        | `0`                  |
| `AVERAGE`        | Sum / Count (ignoring `null`)                    | `Int`, `Float`                                       | excluded        | `null`               |
| **Boolean**      |                                                  |                                                      |                 |                      |
| `COUNT_TRUE`     | Number of items that are `true`                  | `Boolean`                                            | ≙ `false`       | `0`                  |
| `COUNT_NOT_TRUE` | Number of items that are not `true`              | `Boolean`                                            | ≙ `false`       | `0`                  |
| `SOME_TRUE`      | `true` if there are items that are `true`        | `Boolean`                                            | ≙ `false`       | `false`              |
| `SOME_NOT_TRUE`  | `true` if there are items that are not `true`    | `Boolean`                                            | ≙ `false`       | `false`              |
| `EVERY_TRUE`     | `true` if there are no items that are not `true` | `Boolean`                                            | ≙ `false`       | `true`               |
| `NONE_TRUE`      | `true` if there are no items that are `true`     | `Boolean`                                            | ≙ `false`       | `true`               |
| **Distinct**     |                                                  |                                                      |                 |                      |
| `DISTINCT`       | all non-null values without duplicates           | `String`, `ID`, child/root entities, and enums       | excluded        | `[]`                 |
| `COUNT_DISTINCT` | number of non-null values without duplicates     | `String`, `ID`, child/root entities, and enums       | excluded        | `0`                  |

Note that if a value is collected multiple times, it will be used multiple times by the aggregator (e.g. counted
twice).In the future, it will be possible to a field with `DISTINCT` aggregation in another aggregation field. Note that
if a value is collected multiple times, it will be used multiple times by the aggregator (e.g. counted twice). In the
future, it will be possible to a field with `DISTINCT` aggregation in another aggregation field.

### Restrictions

-   Reference fields can currently not be used in the collect path.
-   Aggregation fields can currently not be used in the collect path, including the `DISTINCT` operator.
-   Min/Max depth can currently not be specified on child entities or nested value objects.
-   Min/Max depth can currently not be specified for indirectly recursive relations.
-   The InMemoryAdapter currently does not support min/max depth.

Also, some possible performance optimizations are not implemented yet. For example, the `DISTINCT` operator is applied
at the end of a collection and not as early as possible.

## Permissions

cruddl provides a role-based permission system. Permission rules can be defined on root entities and on fields. For root
entities, the permissions can also be made dependent on a special field within the object to implement multi-tenancy.

Currently, there are two ways to specify permissions: Via the `@roles` directive or via permission profiles. The
`@roles` directive will be deprecated in the future, but currently it is needed for field-based permissions.

The basic example above already specified a permission profile `default` which is applied to all root entities without
an explicit `permissionProfile` argument in the `@rootEntity` directive:

```json
{
    "permissionProfiles": {
        "default": {
            "permissions": [
                {
                    "roles": ["users"],
                    "access": "readWrite"
                }
            ]
        }
    }
}
```

This profile grants unrestricted access for the "users" role. The roles of a user are take from the `authContext`
property on the GraphQL context. The following permission profile "restricted" allows read access to all roles starting
with "user" and provides full access to the role "admin":

```json
{
    "permissionProfiles": {
        "restricted": {
            "permissions": [
                {
                    "roles": ["admin"],
                    "access": "readWrite"
                },
                {
                    "roles": ["user*"],
                    "access": "read"
                }
            ]
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

Permission profiles are looked up in all json/yaml files within the type's namespace. If not found there, the namespace
tree is navigated upwards. Permission profiles can be shadowed (i.e. a profile can be defined in a parent and in a child
namespace, and the child namespace wins), but this generates a warning. The permission profile `default` can be shadowed
without warning, so you can have namespace-dependent default permission profiles.

If a role specifier in a permission profile starts with a forward slash (`/`), it is interpreted as a regular
expression. Be careful to use the start-of-string and end-of-string anchors (`^` and `$`) to match the whole role
instead of just part of it. An example would be `"/^supplier-([a-z]+)$/"`.

### Field permissions

To set permissions on individual fields, you need to use the `@roles` directive. This will be changed in the future to
also work with permission profiles.

```graphql
type Customer @rootEntity {
    paymentInfo: PaymentInfo @roles(readWrite: ["support-privileged"], read: [])
}
```

### Data-dependent permissions

Use `restrictToAccessGroups` for a data-dependent permission profile: grants unrestricted access for all roles. The
following permission profile "restricted" allows read access to all roles starting with "user" and provides full access
to the role "admin":

```json
{
    "permissionProfiles": {
        "restricted": {
            "permissions": [
                {
                    "roles": ["admin"],
                    "access": "readWrite"
                },
                {
                    "roles": ["support-europe"],
                    "access": "read",
                    "restrictToAccessGroups": ["EUROPE"]
                },
                {
                    "roles": ["support-america"],
                    "access": "read",
                    "restrictToAccessGroups": ["NORTH_AMERICA", "SOUTH_AMERICA"]
                }
            ]
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
    EUROPE
    NORTH_AMERICA
    SOUTH_AMERICA
    RESTRICTED
}
```

-   Users with role "admin" can access all orders.
-   Users with role "support-europe" can only access orders where `accessGroup` has the value "EUROPE".
-   Users with role "support-america" can only access orders where `accessGroup` has the value "NORTH_AMERICA" or "
    SOUTH_AMERICA".
-   Users with role "support-america" and "support-europe" can only access orders where `accessGroup` has the value "
    EUROPE", "NORTH_AMERICA", or "SOUTH_AMERICA".

You can also dynamically assign role-dependent access groups using regular expressions and capturing groups. For
example:

```json
{
    "permissionProfiles": {
        "forwarders": {
            "roles": ["/^forwarder-(.+)$/"],
            "access": "readWrite",
            "restrictToAccessGroups": ["forwarded-by-$1", "forwarded-by-anyone"]
        }
    }
}
```

A user with roles `forwarder-fast` and `forwarder-quick` is granted access to objects with `accessGroup`
`forwarded-by-fast`, and `forwarded-by-quick`, and `forwarded-by-anyone`.

### Data-dependent permissions using multiple fields

If you need to restrict access depending on multiple fields, or you want to use a custom field instead of `accessGroup`,
you can alternatively use the following more flexible feature.

```json
{
    "permissionProfiles": {
        "restricted": {
            "permissions": [
                {
                    "roles": ["support"],
                    "access": "readWrite",
                    "restrictions": [
                        {
                            "field": "isTopSecret",
                            "value": false
                        }
                    ]
                },
                {
                    "roles": ["/^seller-(.+)$/"],
                    "access": "readWrite",
                    "restrictions": [
                        {
                            "field": "seller",
                            "valueTemplate": "$1"
                        }
                    ]
                },
                {
                    "roles": ["/^buyer-(.+)$/"],
                    "access": "readWrite",
                    "restrictions": [
                        {
                            "field": "buyer",
                            "valueTemplate": "$1"
                        }
                    ]
                }
            ]
        }
    }
}
```

Without `restrictions` or with an empty array, the role grants access to all root entities covered by the permission
profile. Each item in the `restrictions` array applies a further restriction on the value of a field. Only if all
restrictions are met in a root entity, the access will be granted. If you need an OR combination, use multiple
`permissions` items with identical roles.

Each restriction applies to a single field. You can specify a dot-separated path to nested fields, but root entity
boundaries cannot be crossed. In general, the restrictions of index field paths apply, too.

The simplest kind of restriction requires a specific field value (`"value": "theValue"`). If you used a regular
expression for matching the roles, you can also spedify `valueTemplate` and use the capture groups, e.g.
`"valueTemplate": "value-$1"`.

If you supply the claims of a user's token, you can also restrict access to objects where the field's value equals this
claim value (or any of the claim values, if the claim is an array), with `"claim": "claimName"`.

## Indices

cruddl supports index handling. During start up they are extracted from the schema and created or removed from the
database.

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

### Index options (unique and sparse)

Aside from the field list, indices have two options: `unique` and `sparse`. The field directives only have the `sparse`
option because `@unique` is its own directive.

-   If `unique` is set, a unique constraint is created. This constraint ensures that there are no two root entities with
    the same value for this field. The index cannot be created (the creation will fail) if there are already conflicting
    root entities, and following creations and updates will throw an error if the constraint would be violated through
    this change.

-   `sparse` determines whether `null` values will be included in the index. If the option is set to `true`, `null`
    values will be omitted. Regular indices are non-sparse by default, unique indices are sparse by default. Unique
    sparse indices allow the value `null` in at most one root entity. For non-unique indices, the `sparse` option
    reduces index size, but it disqualifies the index to be used in some cases. For example, a sparse index cannot be
    used for sorting unless there also is a filter that makes sure no `null` values can be returned (even if there are
    actually no `null` values currently in the database).

## Scalar types

### Text types

#### String

The `String` scalar type represents textual data, represented as UTF-8 character sequences. The String type is most
often used by GraphQL to represent free-form human-readable text.

#### ID

The `ID` scalar type represents a unique identifier, often used to refetch an object or as key for a cache. The ID type
appears in a JSON response as a String; however, it is not intended to be human-readable. When expected as an input
type, any string (such as `"4"`) or integer (such as `4`) input value will be accepted as an ID.

#### I18nString

The `I18nString` scalar type represents an internationalized string.

Structurally, the `I18nString` type is equivalent to the `StringMap` type. Keys are ISO 639-1 language codes, and values
are the localized strings. In the future, more specific features may be added to this type, so it is preferred over the
"StringMap" type to represent internationalized strings.

Values are _not_ additionally JSON-encoded or JSON-parsed, so e.g. pass a raw JSON object here instead of a
JSON-representation of that object.

### Numeric types

#### Int

The `Int` scalar type represents non-fractional signed whole numeric values. Int can represent values between -(2^31)and
2^31 - 1.

#### Float

The `Float` scalar type represents signed double-precision fractional values as specified by
[IEEE 754](https://en.wikipedia.org/wiki/IEEE_floating_point).

#### Int53

The `Int53` scalar type represents non-fractional signed whole numeric values. `Int53` can represent values between -(
2^53) and 2^53 - 1.

Values of this type are serialized as numbers in GraphQL and JSON representations. The numeric range of this type
corresponds to the safe integer range of an IEEE 754 double precision binary floating-point value.

#### Decimal1, Decimal2, Decimal3

The `Decimal1`, `Decimal2`, and `Decimal3` scalar types represent signed numeric values with up to 1, 2, or 3,
respectively, decimal digits. All three types can represent values between -1000000000.0 and 1000000000.0.

Values of this type are serialized as numbers in GraphQL and JSON representations. The value is always rounded to the
respective amount of decimal digit.

### Date / Time types

#### DateTime

The `DateTime` scalar type represents a point in time in UTC, in a format specified by ISO 8601, such as
`2007-12-03T10:15:30Z` or `2007-12-03T10:15:30.123Z`.

This scalar type rejects values without timezone specifier or with a timezone other than UTC. See also `LocalDate` and
`LocalTime` for values without timezone specifier. To store Date/time values with timezones other than UTC, define a
value object type with the fields you need.

The _second_ part is added if not specified, e.g. `2007-12-03T12:34Z` is converted to `2007-12-03T12:34:00Z`. Second
fraction digits are cut off at the nearest three-digit group, e.g. `2007-12-03T00:00:00.1234Z` is converted to
`2007-12-03T00:00:00.123400Z`.

Values with leap seconds are shifted back by one second, but this behavior should not be relied upon.

#### LocalDate

The `LocalDate` scalar type represents a date without time zone in a format specified by ISO 8601, such as 2007-12-03.

#### LocalTime

The `LocalTime` scalar type represents a time without time zone in a format specified by ISO 8601, such as 10:15:30 or
17:05:03.521.

The valid range is between 00:00:00 and 23:59:59.999999999. 24:00 is not allowed to avoid bugs in clients that treat 24:
00 as 0:00.

The seconds part is cut off if it is zero, e.g. 12:34:00 is converted to 12:34. Second fraction digits are cut off at
the nearest three-digit group, e.g. 00:00:00.1234 is converted to 00:00:00.123400.

Leap seconds can not be specified.

#### OffsetDateTime

The `OffsetDateTime` scalar type represents a point in time with a timezone offset, in a format specified by ISO 8601,
such as `2007-12-03T10:15:30+01:00` or `2007-12-03T10:15:30.123Z`.

Only use this type for timestamps that are inherently tied to a location and the timezone offset should be calculated
eagerly. To only store a point in time, use `DateTime`.

The _second_ part is added if not specified, e.g. `2007-12-03T12:34Z` is converted to `2007-12-03T12:34:00Z`. Offset
specifier `Z` is accepted but will be converted to `+00:00`. Leap seconds are not supported.

### Other types

#### Boolean

The `Boolean` scalar type represents `true` or `false`.

#### JSON

The `JSON` scalar type represents an arbitrary JSON value. This can be a string, number, boolean, array, or object.

Values are _not_ additionally JSON-encoded or JSON-parsed, so e.g. pass a raw JSON object here instead of a
JSON-representation of that object.

#### JSONObject

The `JSONObject` scalar type represents a JSON object type with arbitrary properties.

This is similar to the `JSON` scalar type but disallows arrays, strings, numbers, and booleans.

Values are _not_ additionally JSON-encoded or JSON-parsed, so e.g. pass a raw JSON object here instead of a
JSON-representation of that object.

#### StringMap

The `StringMap` scalar type consists of a JSON object with only strings as values.

This type can be used for key-value mappings where fetching keys without values or values without keys does not make
sense. For arbitrary maps, the "JSONObject" type can be used instead.

Values are _not_ additionally JSON-encoded or JSON-parsed, so e.g. pass a raw JSON object here instead of a
JSON-representation of that object.

## System fields

Root entities and child entities have the implicit fields `id`, `createdAt` and `updatedAt` (the latter two of type
`DateTime`). They are managed by cruddl and cannot be overwritten.
