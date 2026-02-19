# Adding new features to cruddl

Consult this documentation if you want to add a new feature to cruddl. It lists all the layers that
likely need to be touched.

## Developer-facing API (overview)

-   cruddl consumes a schema given as GraphQL SDL that defines available types, fields and more.
    Some configuration like authorization and i18n are passed in as JSON or YAML.
-   An app embedding cruddl can create a new Project instance and pass the configuration files in.
    It can validate the source files, which results in errors and warnings with exact source
    positions.
-   If a project is valid, the app can create a Model from it to introspect the meta model as
    well-defined programmatic API.
-   To actually make use of the project, the app also needs to create a database adapter, usually
    using the ArangoDBAdapter. There is also an InMemoryAdapter which is mainly used for testing.
-   Combining a Project and a database adapter, cruddl can generate an executable GraphQL schema.
    This schema includes graphql queries and mutations for crud operations including filtering,
    sorting and pagination.

## Internal architecture

-   Public-facing APIs are mainly in `src/project/`, e.g. `Project`.
-   Sources (files) are passed as `ProjectSource` and available at `Project.sources`.
-   The core of `Project.createSchema()` (the main API) calls `validateAndPrepareSchema()` from
    `src/schema/schema-builder.ts`, which includes the whole pipeline. It is detailed below.
-   All public exports are defined in either `core-exports.ts`, `src/database/arangodb/index.ts` or
    `src/database/inmemory/index.ts`. Those represent separate entrypoints.

### From sources to model

`Project.getModel()` calls `validateAndPrepareSchema()` (`src/schema/schema-builder.ts`), which
performs the following steps:

-   First, there are source-level validators in `src/schema/preparation/ast-validator.ts`
    (`sourceValidators`). There are currently none.
-   Then, the source files are parsed individually (YAML, JSON, GraphQL SDL), resulting in
    `ParsedProjectSource` objects. This can also report errors like parse errors. JSON and YAML are
    treated the same after this step.
-   Then, the `parsedProjectSourceValidators` defined in `src/schema/preparation/ast-validator.ts`
    are run on the parsed sources. They include most standard GraphQL rules or a jsonschema-based
    validation of object sources. It validates directives and their arguments against the schema
    defined in `src/schema/graphql-base.ts`.
-   Then there is a step `executePreMergeTransformationPipeline`
    (`src/schema/preparation/transformation-pipeline.ts`) which runs but has no registered
    transformations by default.
-   The call to `createModel()` (`src/model/create-model.ts`) is a big step
    -   It first creates `...Config` objects from the sources (those are just plain objects, with
        interfaces defined in `src/model/config`). This can report errors if e.g. the GraphQL SDL
        technically allows things that do not fit into the `...Config` interfaces. For example, it
        restricts which directives can be used where and with which arguments.
    -   Then, it passes the `...Config` objects to the constructors of actual model classes defined
        in `src/model/implementation`, like `RootEntityType` or `Field`. The model classes usually
        get a reference to the `Model`, but this instance is not fully constructed yet. For this
        reason, the constructors should only perform local operations and not access the model yet.
    -   Many properties of the model classes are implemented as getters that lazily fetch required
        other types from the passed `Model` and use the `@memorize()` decorator to ensure constant
        execution time.
-   Finally, `validatePostMerge()` is called which simply calls `validate()` on all model instances.
    This is where most complex validations should happen as these methods have full access to the
    whole model, and they can use type-safe interfaces to other model components. However, they need
    to make sure they don't throw errors when validating models with errors. For example, the type
    of a field might not exist in the model.

### From model to executable GraphQL schema

`Project.createSchema()` calls `createExecutableSchema()` (`src/schema/schema-builder.ts`). It
passes in a database adapter.

First, this calls `validateAndPrepareSchema()` as described above to get the model. It will only
continue if there are no validation errors.

For the actual schema generation, the `SchemaGenerator` class
(`src/schema-generation/schema-generator.ts`) is used, which in turn is split into many classes.
They use an IoC pattern without a DI framework. The classes follow the GraphQL type system

-   `SchemaGenerator`
-   `RootTypesGenerator` (just a wrapper)
-   `QueryTypeGenerator` and `MutationTypeGenerator` (they mainly generate the root fields in those
    types)
-   `OutputTypeGenerator` for output types and their fields
-   Input types are most complex and therefore have separate directories: `create-input-types`,
    `filter-input-types`, `flex-search-filter-input-types` and `update-input-types`.
-   `FlexSearchGenerator` generates `flexSearch...` fields, which is an abstraction over ArangoDB's
    ArangoSearch views. It is used for all root entity types where flexSearch is enabled.

These generators usually do not create graphql types directly but instead use a framework
implemented in `src/schema-generation/query-node-object-type`. The main difference is: The
`resolve()` function of a field does not return the actual value, but instead returns a `QueryNode`
(next sections) that describes how the node should be evaluated. The database adapter will translate
this `QueryNode` into a database fragment.

One more note: All resolvers of a single GraphQL operation are combined into a single `QueryNode`
that is executed in one go. This is implemented in `addOperationBasedResolvers()`. This allows for
atomic operations and better performance.

### From GraphQL query to intermediate query (`QueryTree`)

At runtime, the executable schema uses the `OperationResolver` to convert the GraphQL operation
(parsed query, variables and info) into a root `QueryNode` that is then run via the database
adapter.

These are the steps done in the `OperationResolver` (`src/execution/operation-resolver.ts`):

-   `distillOperation()` (`src/graphql/query-distiller.ts`) converts the graphql operation into a
    simpler view where e.g. variables are inlined. The resulting `FieldSelection` and `FieldRequest`
    interfaces are used in the next steps.
-   `buildConditionalObjectQueryNode()`
    (`src/schema-generation/query-node-object-type/query-node-generator.ts`) calls the `resolve`
    methods of the schema outlined in the last step to recursively build a `QueryNode` tree. This is
    the main step where the schema is used.
-   There are some steps concerning flex search (`queryFlexSearchTokens`, `expandQueryNode`)
-   The whole `QueryNode` tree is passed into `applyAuthorizationToQueryTree`
    (`src/authorization/execution.ts`) which adds authorization checks to the tree. These can be
    simple denies (a whole subtree is replaced with a `RuntimeErrorQueryNode`) or more complex
    filters added (e.g. if a user only has access to objects where e.g. a `tenantId` field matches a
    JWT claim).
-   Finally, the `queryTree` is passed to `DatabaseAdapter.executeExt()`. This can be either
    `ArangoDBAdapter` (`src/database/arangodb/arangodb-adapter.ts`) or `InMemoryAdapter`
    (`src/database/inmemory/inmemory-adapter.ts`).

### From `QueryNode` to database query

-   `ArangoDBAdapter.executeExt()` has some boilerplate including transaction handling and error
    reporting.
-   A single query tree can result in multiple "transaction steps", which are separate AQL queries.
    They are all executed in one javascript transaction in ArangoDB, and the results of one step can
    be passed to following steps. This is implemented using the `AQLCompoundFragment` class. This is
    important for validations (a step can throw, which results in the whole transaction failing),
    for executing things in order, or because of AQL traversal limitations (you cannot arbitrarily
    combine UPDATE and DELETE operations of the same collection in one AQL query).
-   Eventually, it calls `getAQLQuery()` in `src/database/arangodb/aql-generator.ts`.
-   Each `QueryNode` has a `register(...)` function that handles how to convert the query node into
    an AQL fragment
-   To emit AQL, there is a framework in `src/database/arangodb/aql.ts`. It takes care of variable
    binding, variable naming and escaping.

The `InMemoryAdapter` works similarly but instead of generating AQL, it generates and executes
JavaScript. It has no transaction handling. It is not optimized for performance, only for
compatibility. If in doubt, it mimics ArangoDB's behavior (e.g. with respect to value order).

### Database migrations

The `ArangoDBAdapter` has a framework for running database migrations. Since ArangoDB is schemaless,
this is not required for added fields, but there are still some migrations, like creating new
collections or adding indices.

-   `ArangoDBAdapter.updateSchema()` runs all migrations. There are also APIs to get pending
    migrations and to run a single migration.
-   `SchemaAnalyzer` (`src/database/arangodb/schema-migration/analyzer.ts`) compares the current
    database schema with the required schema and creates migration objects for each required change.
    Each migration has a structural ID, which can be used to ensure that the same migration will not
    be run twice at the same time. This needs to be implemented by the embedder.
-   `MigrationPerformer` (`src/database/arangodb/schema-migration/performer.ts`) performs a
    migration.

### Modules

Modules are a schema-level feature that allows types and fields to be scoped to named modules. This
enables a single baseline schema to define required structure while allowing individual deployments
to include only the modules they need.

-   Modules are declared in an object source and parsed into
    `ModuleDeclaration`(`src/model/implementation/modules/module-declaration.ts`).
-   A module specification e.g. (`@modules(in: ["moduleA", "moduleB"])`) on a type or field defines
    which modules require that type or field to be present. Specifications support AND-combinations
    like `"shipping & dangerous_goods"` (both modules must be active) and OR-combinations (multiple
    clauses).
-   `Project.withModuleSelection()` can be called to create a new project that only includes a
    subset of modules. This logic is implemented in `src/project/select-modules-in-sources.ts`.

### Compatibility check

The compatibility check subsystem (`src/model/compatibility-check/`) determines whether one model
can be used in a context that expects another (the "baseline") model. This is used to verify that a
tenant's schema is a valid subset of the platform's baseline schema. It is often useful to combine
this with the modules feature, passing a baseline model with a subset of modules selected.

-   The entry point is `Project.checkCompatibility(baselineProject)`.
-   For each type in the baseline, it verifies a matching type exists in `modelToCheck` with the
    same kind, fields, field types, indices, and other configuration.
-   Missing types and fields produce `QuickFix` objects (with a `ChangeSet`) so that tooling can
    offer automatic code actions to add the missing definitions, including their i18n labels.
-   The checks are implemented per model component in `src/model/compatibility-check/check*`. They
    always receive the component to check, the baseline, and a shared `ValidationContext` and add
    messages to it.

## Tests

-   All tests are in `spec/*` and mimic the directory structure in `src/`.

-   Validations are mainly tested in `spec/schema/ast-validation-modules`, even though this does not
    resemble the source file structure.

### Regression tests

Regression tests (`spec/regression`) are the most important tests. They end-to-end test from the
schema definition over the GraphQL query to the actual results.

-   The regression tests are organized into suites (the first subdirectory in `spec/regression`).
-   Each suite defines a complete model in `model/` and test data in `test-data.json`.
-   In `tests/`, there is one directory per test.
-   Each test has a `test.graphql` file with a series of GraphQL operations. The operations are
    always executed in order, so that e.g. a mutation can create data for a following query.
-   Each test runs independently, i.e. after a test is complete, the data is reset.
-   `result.json` contains the expected results of the operations in `test.graphql`. It can use
    `@{ids/TypeName/localID}` to reference IDs of the test-data objects because they are not
    consistent.
-   For each operation, there is a file in `aql/*.aql` containing the AQL generated for the
    operation.
-   The framework and test file is located in `spec/regression/regressions.spec.ts`. It is a single
    test that runs all regression tests. To only run some tests, specify
    `--regression-tests=<suite>/<test>`.
-   The `result.json` and the AQL files can be generated by running the tests with the
    `--save-actual-as-expected` flag. Result files might need to be cleaned up to use `@{ids/...}`
    references instead of hardcoded IDs.
-   By default, all tests are run with the InMemoryAdapter and the ArangoDBAdapter. To run only one
    of them locally, specify `--db=in-memory` or `--db=arangodb`. To completely disable them for a
    specific database, set `databases.in-memory.ignore` or `databases.arangodb.ignore` to `true` in
    `meta.json` in the test directory.

## Planning new features

Consider which layers will be affected:

-   Will schema authors enable or configure the new feature in their schema definitions?
    -   Should it be done in GraphQL SDL (good for proximity to types and fields) or in a separate
        JSON/YAML file (good for cross-cutting features like TTL or large configurations like i18n)?
    -   Design how a schema author would write a schema, using examples to evaluate the design. It
        should fit well into the existing schema definition style. Breaking changes are not
        acceptable, but after careful consideration, existing features can be deprecated in favor of
        new ones.
    -   In case of GraphQL, add directives, arguments etc. to `src/schema/graphql-base.ts`
    -   In case of JSON/YAML, add to
        `src/schema/preparation/source-validation-modules/schema/schema.json` and re-run
        `npm run compile-json-schema`.
    -   Consider all validations that are necessary to make it impossible for a schema author to
        configure something that would lead to runtime errors or unexpected behavior. Input that
        will already be caught by GraphQL or JSON schema validation does not need to be validated
        again, but all other invalid input should be caught with clear error messages and source
        positions.
    -   Consider where to run the validations. Most validations should be done in the model classes.
    -   Write test cases for all validations, including edge cases and error cases. Use the existing
        tests as a style guide.
-   Should the generated GraphQL schema change, e.g. new mutations/queries or changes to the input
    types?
    -   Design queries and mutations a user of the GraphQL schema would write, using examples to
        evaluate the design. It should fit well into the existing GraphQL API style. Breaking
        changes are not acceptable.
    -   Implement the structural changes in the schema generator. You can leave out the `resolve()`
        functions for now and only focus on generating the correct fields, types etc.
-   Are database migrations required?
    -   Only applies to ArangoDB.
    -   Design migration steps.
    -   Downtime is not acceptable - migrations must be runnable while the system is live.
    -   Implement tests for the migrations.
-   Does the existing query tree (`QueryNode`) framework cover the new feature?
    -   Now consider how you would implement the `resolve()` callbacks. Can the new feature be
        expressed using the existing `QueryNode` classes?
    -   To add a new query node, create the class (look at examples in `src/query-tree/`) and
        register it using `register()` both in `src/database/arangodb/aql-generator.ts` and
        `src/database/inmemory/js-generator.ts`.
-   Implement resolvers
-   Does AQL (and javascript) generation need to be changed?
