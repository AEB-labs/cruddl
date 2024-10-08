# FlexSearch Guide

Cruddl allows the usage of [ArangoSearch](https://www.arangodb.com/arangodb-training-center/search/)
to create fulltext-indices on your data.

## Schema

To create an index for a rootEntity add the `flexSearch: true` argument to the `@rootEntity`
annotation.

```graphql
type Order @rootEntity(flexSearch: true) {
    orderNumber: String
    description: String
}
```

The system fields (`id`, `createdAt` and `updatedAt`) and fields annotated with `@key` are
automatically indexed.

To add additional fields to the index, the `@flexSearch` or the `@flexSearchFulltext` annotation
needs to be added to the field.

The annotation `@flexSearch` is used to index a field as a value. Values are fields that do not
contain a Text in a specific language. For example an orderNumber might be indexed as a value. Also
all numeric, boolean or DateTime values can only be indexed as Values. Value comparisons in
FlexSearch are case-sensitive.

Fields inside child entities, entity extensions and value objects are only indexed if all fields in
the path from the root entity to the field are also annotated with `@flexSearch`.

```graphql
type Order @rootEntity(flexSearch: true) {
    orderNumber: String @flexSearch
}
```

The annotation `@flexSearchFulltext` is used to index Strings that contain text in a specific
language. For example a description that contains a human-readable text in english.

Some text processing (e.g. normalizing plural words to their singular forms) is language-dependent.
By default, the algorithm is configured for English, so it might be inaccurate for other languages.
The language can be changed with the `language` argument on `@flexSearch` or the
`flexSearchLanguage` argument in `@rootEntity`.

```graphql
type Order @rootEntity(flexSearch: true) {
    descriptionEN: String @flexSearchFulltext
    descriptionDE: String @flexSearchFulltext(language: DE)
}
```

The following languages are currently available: EN, DE, ES, FI, FR, IT, NL, NO, PT, RU, SV, ZH

Fields can also be indexed as both value and text.

Cruddl also allows to predefine specific fields that will be included in a general search. To do
this, the argument `includeInSearch` needs to be added to the `@flexSearch` or `@flexSearchFulltext`
annotation. Fields inside child entities, entity extensions and value objects are only searched if
all fields in the path from the root entity to the field are also marked as `includeInSearch`.

```graphql
type Order @rootEntity(flexSearch: true, flexSearchLanguage: EN) {
    orderNumber: String @flexSearch(includeInSearch: true)
    descriptionEN: String @flexSearchFulltext(includeInSearch: true)
    descriptionDE: String @flexSearchFulltext(language: DE)
}
```

In this example an "expression search" would search in the fields `orderNumber` and `descriptionEN`
but not the field `descriptionDE`.

A field annotated with `@key` is included in search by default. To disable this, manually specify
`@flexSearch(includeInSearch: false)` on the field.

### FlexSearch Order

A rootEntity that is marked with `flexSearch: true` can also define a `flexSearchOrder`. This will
define the order in which the elements are saved in the index.

This will be the default order in which the elements of a flexSearch-query are returned.

If a query matches the default order, or a "prefix" of the default order, the elements can simply be
read from the index, and no sorting is necessary.

Inverted sorting directions are not supported by the index.

So in the following example either `[orderNumber_ASC]` or `[orderNumber_ASC, createdAt_DESC]` will
skip the sorting, while `[orderNumber_DESC]` or `[createdAt_DESC]` will not.

```graphql
type Order @rootEntity(
    flexSearch: true,
    flexSearchLanguage: EN,
    flexSearchOrder: [
        { field: "orderNumber", direction: ASC },
        { field: "createdAt", direction: DESC }
    ]
) {
    #...
}
```

## API

For each `rootEntity` that is marked with `flexSearch: true` a new query is available that allows to
query for objects using ArangoSearch. The queries are prefixed with "flexSearch".

This query also accepts a string argument that provides an expression that should be searched for in
all fields that were marked with `includeInSearch: true` in the schema.

```graphql
query {
    flexSearchOrders(flexSearchExpression: "01234") {
        orderNumber
    }
}
```

The query also accepts a special `flexSearchFilter` that works similar to a normal filter but
contains different fields.

```graphql
query {
    flexSearchOrders(flexSearchFilter: { orderNumber_starts_with: "123" }) {
        orderNumber
    }
}
```

The query also accepts the pagination arguments `first`, `skip` and `after` and the sorting argument
`orderBy`. The regular filter argument is available as `postFilter`. Because the ArangoSearch-index
cannot be used for sorting and regular filtering, these can be very slow for large amounts of data.
To prevent slow queries, cruddl returns an error in these cases.

### Filter

The following filter-fields are available for fields that are annotated with `@flexSearch`:

-   `equals`
-   `not_equals`
-   `in`
-   `not_in`
-   `starts_with`
-   `not_starts_with`

The following filter-fields are available for fields that are annotated with `@flexSearchFulltext`

-   `contains_any_word`
-   `not_contains_any_word`
-   `contains_all_words`
-   `not_contains_all_words`
-   `contains_all_prefixes`
-   `not_contains_all_prefixes`
-   `contains_any_prefix`
-   `not_contains_any_prefix`
-   `contains_phrase`
-   `not_contains_phrase`

When using `flexSearchExpression: "..."` the `starts_with` field is used for values and the
`contains_all_prefixes` field for texts.

### PostFilter and Sorting

For cases where using the flexSearchFilter is not possible, there is a `postFilter` which has the
capabilities of normal filtering. It is applied in memory after the `flexSearchFilter` is applied
and can never use any indices. The same applies to any sorting that does not match the
flexSearchOrder.

To prevent queries with bad performance a `FLEX_SEARCH_TOO_MANY_OBJECTS` error is thrown when a
postFilter or sorting is applied to more than 10 000 Objects (the exact number is configurable via
the flexSearchMaxFilterableAndSortableAmount ExecutionOption). This limit is applied after the
`flexSearchFilter` is applied so if the `flexSearchFilter` already reduces the amount of objects,
the `postFilter` is applied to below the limit, the error is not thrown.

The reasoning behind this is to provide an API that always guarantees to have good performance and
quick response time. When using flexSearchFilter you will always use the ArangoSearch index which
means the query should be fast.
