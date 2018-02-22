#momo
This is a first and incomplete draft of the readme. Don't expect too much.
---

[![coverage report](https://gitlab.aeb.com/next-playground/momo/badges/master/coverage.svg)](https://gitlab.aeb.com/next-playground/momo/commits/master)
[![pipeline status](https://gitlab.aeb.com/next-playground/momo/badges/master/pipeline.svg)](https://gitlab.aeb.com/next-playground/momo/commits/master)

A library to expose a database via GraphQL and model its schema with a GraphQL-based DDL

This is the core of the model-manager, a runtime component that manages data in a GraphQL-based distributed system.

The purpose of `momo` is to create a GraphQL schema that can be used to access a data base via queries and mutations.
This GraphQL schema is generated from a schema definition that contains the types, fields and relations.
`createSchema` and `addQueryResolvers` are the two main functions: They take a schema description and a database backend and create an operational GraphQLSchema instance which can be passed directly to a GraphQL server.

### Features

* Schema modelling via the GraphQL language with types and directives
* Extensive schema validation
* Role-based authorization (field and type-based)
* Advanced modelling features based on document and graph databases (root entities, value objects, relations and more)
* Pluggable database backends (currently supports ArangoDB and an in-memory implementation)

# Usage

# Modelling guide
## Meta types
momo supports four basic meta types which basically can be annotated as directive to a GraphQL schema type definition. Each type must have on of these directives.

### @rootEntity
A root entity represents a base model. A collection with the types plural name will be created in the database.
```graphql
type Person @rootEntity {
   name: String
   shoeSize: Int
}
```
### @childEntity
A child entity is an entity which belongs list-wise to a root entity but has no own collection. It is stored within the root entity. References to child entities from other root entities are not possible. Root entities can be reused in several root entities.  

```graphql
type Organ @childEntity {
   name: String
   location: String
   existential: Boolean
   count: Int
}

```
Now, we can add organs to the ```Person``` type: 
```graphql
type Person @rootEntity {
    ...
    organs: [Organ]
}
```

### @entityExtension
An entity extension also is an entity which does not have an isolated representation in the database. It is used to store a record of self-contained fields which can be used in several root entities.
```graphql
type Education @entityExtension {
    schoolYearsCount: Int
    degree: Degree
    languagesSpoken: [String]
}

enum Degree {
    BSc
    MSc
    PhD
}

type Person @rootEntity {
    ...
    education: Education
}
```
### @valueObject
Value objects are atomic objects in the sense of domain driven design. They behave like scalars.
```graphql
type Address @valueObject {
    street: String
    postalCode: String
    city: String
}

type Person @rootEntity {
    ...
    domicile: [Address]
}
```
## Relationships
### @relation
A @relation directive on a field from the top level of one root entity to another root entity.
```graphql
type Person @rootEntity {
    ...
    likes: [Person] @relation
    likedBy: [Person] @relation(inverseOf: "likes")
}
```
The field ```likes``` is a n-to-m relationship to more ```Person``` objects.

A relationship does not necessarily need the inverse field. Cardinalities are defined implicitly.  

In Arango an edge collection with the name ```people_likes``` is created. Edges are directed from the ```likes``` field to the ```likedBy``` field. The ```inverseOf``` argument is required to tell momo that both relationships belong together. Without inverseOf, a separate edge collection people_likedBy would be created.

### @reference
A @reference field defines a link to a foreign root entity. Lists of references are not allowed. There is no back link. References can used e. g. for links to very commonly used objects which don't care about the references.

A referred root entity can be referred by ID (default) or by setting a @key on a scalar field.
A reference mostly corresponds to a foreign key in relational databases.
```graphql
type Person @rootEntity {
    ...
    country: Countr @reference
}

type Country @rootEntity {
    name: String
    isoCode: String @key
}
```

## Roles
## Indices
momo supports index handling. During start up they are extracted from the schema and created or removed from the database.
### Root entity index definition
Indices can be added to the @rootEntity directive:
```graphql
type Person @rootEntity(indices: [{ fields: ["lastName", "firstName"], unique: false}, {fields:["education.degree"]}]) {
    lastName: String
    firstName: String
    education: Education
}
```

### Field index definition
Indices can also be directly attached to fields. For each field, one index is created. Multi-field indices are not supported via field definition.
```graphql
type Person @rootEntity {
    lastName: String @index
    passportNumber: String @unique
}
```
## Examples

# Query
## Basics
Entities can be queried either by id (one result object) or by a filter (a list of result objects).
Relations and references are resolved during query and their fields are available for query.

```graphql
type Person {
    name: String
}

query {
    Person("42") {
        name
    }
}

query {
    allPeople(filter: { name: "John" }) {
        id
        name
    }
}
```
## More filtering

An entity can be filtered by all own fields and fields of nested/related entites of cardinality one.
For to-n relations and other lists, there are the quantifiers `some`, `every`, `none`. (SQL WHERE EXISTS ...) 
Take care when using quantifiers as they can significantly hit performance due to poor optimization in Arango, especially when dealing with large collections.

## Sorting
Results can be sorted by all fields of the rootEntity including fields from nested/related objects with a cardinality of one. The schema provides an enum with the name of the entity appended by `OrderBy`

# Mutations
## Create
Create a new object using the create* mutation, e. g.
```
mutation {
    createPerson(input: { name: "John" }) {
        id
        name
    }
}
```
This mutation creates a person with the name "John". The ID will be auto-generated and cannot be set manually (thus is not part of the input type). The person will be return for further query.
## Update
Update an existing object using the update* mutation, e. g.
```
mutation {
    updatePerson(id: "42", input: { name: "John" }) {
        name
    }
}
```
This mutation updates the person with the id "42" and set the name to "John". The person will be return for further query.
## Delete
Delete an existing object using the delete* mutation, e. g.
```
mutation {
    deletePerson(id: "42") {
        name
    }
}
```
This mutation deletes the person with the id "42". The person will be return for further query. Note: this behaviour will be propably changed in the future. Traversing relationships is not possible after deletion. 

# Misc
## DateTime
Additional to the default GraphQL scalars String, Int, Float and ID, momo also supports the additional scalar type DateTime.
DateTime is used and represented as specified by the ISO 8601 standard.
## JSON
Another scalar type representing a JSON string. The JSON will be deserialized and stored in the DB.
## id, updatedAt, createdAt
`id: ID`, `createdAt: DateTime`, `updatedAt: DateTime` are added to all @rootEntity object types. They fields on the corresponding objects are auto-managed by momo. 