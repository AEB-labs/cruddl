#cruddl
---
A library to expose a database via GraphQL and model its schema with a GraphQL-based DDL

The purpose of `cruddl` is to create a GraphQL schema that can be used to access a data base via queries and mutations.
This GraphQL schema is generated from a schema definition that contains the types, fields and relations.

### Features

* Schema modelling via the GraphQL language with types and directives
* Extensive schema validation
* Role-based authorization (field and type-based)
* Advanced modelling features based on document and graph databases (root entities, value objects, relations and more)
* Pluggable database backends (currently supports ArangoDB and an in-memory implementation)

# Usage
You need a running Arango database with an existing (empty) database.
* Install cruddle from the npm registry to your local npm project and add it to the dependencies
```
npm install cruddle --save
```

* Create a database adapter for Arango DB containing the URL and credentials.
```typescript
const db = new ArangoDBAdapter({
    databaseName,
    url: databaseURL,
    user: 'root',
    password: '12345',
    autocreateIndices: true,
    autoremoveIndices: true
});
```

* Load a project with data model and permissions from a directory
```typescript
const project = await loadProjectFromDir(path.resolve(__dirname, 'model'));
```

* Create an executable schema
```typescript
const schema = project.createSchema(db);
```

* Deploy your schema on a GraphQL server. Be sure to use a server which is able to inject your user roles into the graphql context. An example for graphql-server-express could look like this:
```typescript
const app = express();
app.use(cors());
app.get('/', (req, res) => { res.redirect('/graphiql')});
app.use('/graphql', bodyParser.json(), graphqlExpress(() => getGraphQLOptions()));
app.use('/graphiql', graphiqlExpress({endpointURL: '/graphql'}));
app.listen(1337, () => {
    console.info('GraphQL server started on http://localhost:1337.');
});
function getGraphQLOptions(): GraphQLOptions {
    ...
    return {
        schema,
        context: { authRoles: ["admin" ]} // this should not be static but extracted from your request token or session or ...
    };
}
```

See a full featured example including server part on <https://github.com/AEB-labs/cruddl-demo>.

# Modelling guide
## Meta types
cruddl supports four basic meta types which basically can be annotated as directive to a GraphQL schema type definition. Each type must have on of these directives.

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

In Arango an edge collection with the name ```people_likes``` is created. Edges are directed from the ```likes``` field to the ```likedBy``` field. The ```inverseOf``` argument is required to tell cruddl that both relationships belong together. Without inverseOf, a separate edge collection people_likedBy would be created.

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
cruddl supports index handling. During start up they are extracted from the schema and created or removed from the database.
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
Additional to the default GraphQL scalars String, Int, Float and ID, cruddl also supports the additional scalar type DateTime.
DateTime is used and represented as specified by the ISO 8601 standard.
## JSON
Another scalar type representing a JSON string. The JSON will be deserialized and stored in the DB.
## id, updatedAt, createdAt
`id: ID`, `createdAt: DateTime`, `updatedAt: DateTime` are added to all @rootEntity object types. They fields on the corresponding objects are auto-managed by cruddl. 