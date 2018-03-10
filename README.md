# cruddl

[![npm version](https://badge.fury.io/js/cruddl.svg)](https://npmjs.org/cruddl) [![Build Status](https://travis-ci.org/AEB-labs/cruddl.svg?branch=master)](https://travis-ci.org/AEB-labs/cruddl)

**cruddl** - create a cuddly GraphQL API for your database, using the GraphQL SDL to model your schema.

This TypeScript library creates an executable GraphQL schema from a model definition and provides queries and mutations to access a database. Currently, it supports the multi-model database [ArangoDB](https://www.arangodb.com/). The concept being inspired by existing projects like [prisma](https://github.com/graphcool/prisma) and [join-monster](https://github.com/stems/join-monster), cruddl exploits the expressiveness of the Arango Query Language (AQL) to generate one tailored query for each GraphQL request.

**[Try it online](https://aeb-labs.github.io/cruddl/)**

## Features

* Schema definition using GraphQL types, fields and directives
* Modelling features like relations, embedded lists and objects
* Query features include filtering, sorting, cursor-based pagination and arbitrary nesting
* Schema validation
* Role-based authorization (field and type-based; static and data-dependent)
* Pluggable database backends (currently supports ArangoDB and an in-memory implementation)

## Usage

```
npm install --save cruddl
```

Install [ArangoDB](https://www.arangodb.com/) and create a new database.

```typescript
import { ArangoDBAdapter } from 'cruddl';
const db = new ArangoDBAdapter({
    databaseName: 'databaseName',
    url: 'http://root:@localhost:8529',
    user: 'root',
    password: ''
});
```

If you just want to explore the features, you can also use an in-memory database implementation - but don't use this for anything else.

```typescript
import { InMemoryAdapter } from 'cruddl';
const db = new InMemoryAdapter();
```

Define your data model and create a project:

```typescript
import { Project } from 'cruddl';
const project = new Project([{
  name: 'schema.graphqls',
  body: `
    type Movie @rootEntity {
      title: String
      actors: Actor @relation
    }
    
    type Actor @rootEntity {
      name: String
      movies: Movie @relation(inverseOf: "actors")
    }`
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

Then, create the GraphQL schema and serve it:

```typescript
import { GraphQLServer } from 'graphql-yoga';
const schema = project.createSchema(db);
db.updateSchema(schema); // create missing collections
const server = new GraphQLServer({ schema, context: () => ({ authRoles: [ 'users' ]}) });
server.start(() => console.log('Server is running on http://localhost:4000/'));
```

See the [modelling guide](docs/modelling.md) and the [api documentation](docs/api.md) for details or clone [this repository](https://github.com/AEB-labs/cruddl-demo) for a full featured example.

## Status

Although the feature set is already quite extensive, this project is still in active development. A number of regression tests helps to avoid unexpected changes in behavior, but they do not yet cover all cases. Documentation is relatively sparse and will be extended in the future. We aim to contribute to the ongoing developments regarding GraphQL database interfaces and might change our API to more closely match these of other implementations in the future.

## Documentation

* [Modelling guide](docs/modelling.md)
* [GraphQL API](docs/api.md)
