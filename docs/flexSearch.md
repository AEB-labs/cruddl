#FlexSearch Guide
Cruddl allows the usage of [ArangoSearch](https://www.arangodb.com/arangodb-training-center/search/) to create fulltext-indices on your data.

## Schema

To create an index for a rootEntity add the `flexSearch: true` parameter to the `@rootEntity` annotation.


```graphql
type Order @rootEntity(flexSearch: true) {
  orderNumber: String
  description: String
}
```

This also means that the system fields (`id`, `createdAt` and `updatedAt`) are automatically indexed.

To add additional fields to the index, the `@flexSearch` or the `@flexSearchFulltext` annotation needs to be added to the field.

The annotation `@flexSearch` is used to index a field as a value. Values are fields that do not contain a Text in a specific language.
For example an orderNumber might be indexed as a value. Also all numeric, boolean or DateTime values can only be indexed as Values.
Value comparisons in FlexSearch are case-sensitive.

```graphql
type Order @rootEntity(flexSearch: true) {
  orderNumber: String @flexSearch
}
```

The annotation `@flexSearchFulltext` is used to index Strings that contain text in a specific language.
For example a description that contains a human-readable text in english. 

When using `@flexSearchFulltext` a language needs to be specified, either by adding the `language` parameter,
or by setting a default language for the whole entity by specifying the `flexSearchLanguage` parameter to the `rootEntity` annotation.


```graphql
type Order @rootEntity(flexSearch: true, flexSearchLanguage: EN) {
  descriptionEN: String @flexSearchFulltext
  descriptionDE: String @flexSearchFulltext(language: DE)
}
```

The following languages are currently available:
EN, DE, ES, FI, FR, IT, NL, NO, PT, RU, SV, ZH

Fields can also be indexed as both value and text.

Cruddl also allows to predefine specific fields that will be included in a general search.
To do this, the parameter `isIncludedInSearch` needs to be added to the `@flexSearch` or `@flexSearchFulltext` annotation.

```graphql
type Order @rootEntity(flexSearch: true, flexSearchLanguage: EN) {
  orderNumber: String @flexSearch(isIncludedInSearch: true)
  descriptionEN: String @flexSearchFulltext(isIncludedInSearch: true)
  descriptionDE: String @flexSearchFulltext(language: DE)
}
```

In this example a "general search" would search in the fields `orderNumber` and `descriptionEN` but not the field `descriptionDE`.

