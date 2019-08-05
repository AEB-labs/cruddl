#QuickSearch Guide
Cruddl allows the usage of [ArangoSearch](https://www.arangodb.com/arangodb-training-center/search/) to create fulltext-indices on your data.

## Schema

To create an index for a rootEntity add the `quickSearchIndex: true` parameter to the `@rootEntity` annotation.


```graphql
type Order @rootEntity(quickSearchIndex: true) {
  orderNumber: String
  description: String
}
```

This also means that the system fields (`id`, `createdAt` and `updatedAt`) are automatically indexed.

To add additional fields to the index, the `@quickSearchIndex` or the `@quickSearchFulltextIndex` annotation needs to be added to the field.

The annotation `@quickSearchIndex` is used to index a field as a value. Values are fields that do not contain a Text in a specific language.
For example an orderNumber might be indexed as a value. Also all numeric, boolean or DateTime values can only be indexed as Values.
Value comparisons in QuickSearch are case-sensitive.

```graphql
type Order @rootEntity(quickSearchIndex: true) {
  orderNumber: String @quickSearchIndex
}
```

The annotation `@quickSearchFulltextIndex` is used to index Strings that contain text in a specific language.
For example a description that contains a human-readable text in english. 

When using `@quickSearchFulltextIndex` a language needs to be specified, either by adding the `language` parameter,
or by setting a default language for the whole entity by specifying the `quickSearchLanguage` parameter to the `rootEntity` annotation.


```graphql
type Order @rootEntity(quickSearchIndex: true, quickSearchLanguage: EN) {
  descriptionEN: String @quickSearchFulltextIndex
  descriptionDE: String @quickSearchFulltextIndex(language: DE)
}
```

The following languages are currently available:
EN, DE, ES, FI, FR, IT, NL, NO, PT, RU, SV, ZH

Fields can also be indexed as both value and text.

Cruddl also allows to predefine specific fields that will be included in a general search.
To do this, the parameter `isIncludedInSearch` needs to be added to the `@quickSearchIndex` or `@quickSearchFulltextIndex` annotation.

```graphql
type Order @rootEntity(quickSearchIndex: true, quickSearchLanguage: EN) {
  orderNumber: String @quickSearchIndex(isIncludedInSearch: true)
  descriptionEN: String @quickSearchFulltextIndex(isIncludedInSearch: true)
  descriptionDE: String @quickSearchFulltextIndex(language: DE)
}
```

In this example a "general search" would search in the fields `orderNumber` and `descriptionEN` but not the field `descriptionDE`.

