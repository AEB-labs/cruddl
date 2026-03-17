# Regression Tests

Regression tests verify that generated GraphQL responses (and AQL queries for ArangoDB) match
expected snapshots. They run against both the in-memory and ArangoDB adapters by default.

## Structure

Each suite lives in `src/testing/regression-tests/<suite>/` and contains:

-   `model/` — GraphQL SDL files defining the schema
-   `test-data.json` or `test-data.ts` — seed data
-   `default-context.json` — default auth context for all tests in the suite
-   `tests/<test>/` — individual test cases, each with:
    -   `test.graphql` — GraphQL operations to execute (each must be named)
    -   `result.json` — expected GraphQL response
    -   `vars.json` — _(optional)_ variables
    -   `context.json` — _(optional)_ per-test auth context override
    -   `aql/` — _(ArangoDB only)_ expected AQL files per operation
-   `meta.json` — _(optional)_ suite-level or test-level metadata (see below)

## `meta.json` Reference

`meta.json` can appear at both suite level (`<suite>/meta.json`) and test level
(`<suite>/tests/<test>/meta.json`). All fields are optional.

| Field                                | Type    | Description                                                         | Override logic                               |
| ------------------------------------ | ------- | ------------------------------------------------------------------- | -------------------------------------------- |
| `databases.<db>.ignore`              | boolean | Skip this suite/test for the given database adapter                 | Independent: suite skips all, test skips one |
| `databases.<db>.versions.<v>.ignore` | boolean | Skip for a specific database version                                | Independent (same as above)                  |
| `node.versions.<v>.ignore`           | boolean | Skip for a specific Node.js major version                           | Independent (same as above)                  |
| `waitForArangoSearch`                | boolean | Wait for ArangoSearch views to sync before queries (default: false) | Test overrides suite                         |
| `timeoutInMs`                        | number  | Test timeout in milliseconds (default: 10000)                       | Test overrides suite                         |

Example — skip in-memory and wait for ArangoSearch:

```json
{
    "databases": {
        "in-memory": { "ignore": true }
    },
    "waitForArangoSearch": true
}
```

## Environment Variables

| Variable                   | Description                                                 | Values                                  |
| -------------------------- | ----------------------------------------------------------- | --------------------------------------- |
| `CRUDDL_DB`                | Restrict to a single database adapter                       | `in-memory`, `arangodb` (default: both) |
| `CRUDDL_REGRESSION_FILTER` | Filter tests by glob pattern                                | e.g. `logistics/*`, `papers/create?`    |
| `CRUDDL_UPDATE_EXPECTED`   | Overwrite `result.json` and `.aql` files with actual output | `1` or `true`                           |
| `CRUDDL_TRACE`             | Enable trace-level logging for database adapters            | `1` or `true`                           |

## npm Scripts

```bash
npm run test:regression           # run all regression tests (both DBs)
npm run test:regression:arango    # ArangoDB only
npm run test:regression:in-memory # in-memory only
npm run test:regression:update    # update expected files (ArangoDB)
```

## Common Workflows

### Running all tests

```bash
npm run test:regression
```

### Running a subset of tests

```bash
CRUDDL_REGRESSION_FILTER='logistics/*' npm run test:regression
```

### Updating expected files after intentional changes

After changing schema generation or query building, update the expected snapshots:

```bash
npm run test:regression:update
```

The first run updates the files (and reports failures for changed tests). A subsequent run confirms
everything matches.

### Debugging with trace logging

```bash
CRUDDL_TRACE=true CRUDDL_REGRESSION_FILTER='logistics/create' npm run test:regression:arango
```

## IDE Integration

### WebStorm / IntelliJ

Pre-made shared run configurations are available in `.run/`:

-   **Regression Tests** — both databases
-   **Regression Tests (ArangoDB)** — ArangoDB only
-   **Regression Tests (In-Memory)** — in-memory only
-   **Regression Tests - Update Expected** — ArangoDB + update expected files

These appear automatically in the Run/Debug dropdown.

To run a filtered subset, duplicate a configuration and add `CRUDDL_REGRESSION_FILTER` in the
Environment Variables field.

### VS Code

Use the terminal to run npm scripts with environment variables:

```bash
CRUDDL_REGRESSION_FILTER='logistics/*' npm run test:regression
```

## Adding a New Test

1. Create a directory under the appropriate suite's `tests/` folder
2. Add `test.graphql` with named operations and `result.json` with an empty object `{}`
3. Run `npm run test:regression:update` to populate expected files
4. Review the generated `result.json` and `aql/` files
5. Run `npm run test:regression` to confirm they pass
