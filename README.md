# momo

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
* Pluggable database backends (currently supports ArangoDB)
