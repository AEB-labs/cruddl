# cruddl

[![npm version](https://badge.fury.io/js/cruddl.svg)](https://npmjs.org/cruddl) [![Build Status](https://github.com/AEB-labs/cruddl/workflows/CI/badge.svg)](https://github.com/AEB-labs/cruddl/actions?query=branch%3Amaster) [![Package Quality](https://npm.packagequality.com/shield/cruddl.svg)](https://packagequality.com/#?package=cruddl)

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
const project = new Project({
    sources: [ {
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
    } ],
    getExecutionOptions: ({context}) => ({ authRoles: ['users'] })
});
```

Then, create the GraphQL schema and serve it:

```typescript
import { GraphQLServer } from 'graphql-yoga';
const schema = project.createSchema(db);
db.updateSchema(project.getModel()); // create missing collections
const server = new GraphQLServer({ schema });
server.start(() => console.log('Server is running on http://localhost:4000/'));
```

See the [modelling guide](docs/modelling.md) and the [api documentation](docs/api.md) for details.

### Usage in a browser environment

The core of cruddl perfectly works in a browser (e.g., using webpack), and this can be useful to generate a mock GraphQL schema on the fly or to validate a cruddl project. However, the ArangoDB adapter only works with node imports like `path`. Unless you configure webpack to provide mock modules for them, you will get an error when you import `cruddl` in a webpack environment. To solve this, you can import the core symbols from `cruddl/core` and the `InMemoryAdapter` from `cruddl/inmemory`.

## Documentation

* [Modelling guide](docs/modelling.md)
* [GraphQL API](docs/api.md)
* [I18n](docs/i18n.md)
