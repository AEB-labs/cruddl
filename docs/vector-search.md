# Vector Search

[Vector indexes](https://docs.arango.ai/arangodb/stable/indexes-and-search/indexing/working-with-indexes/vector-indexes/)
are an ArangoDB feature to index vector embeddings stored in documents. cruddl supports creating
such indices and querying them through a simple GraphQL API. This document explains the design and
usage of vector search in cruddl.

This feature is not supported by the InMemoryAdapter.

## 1. Quick start: one vector field, one nearest-neighbor query

Start with the smallest useful setup.

### Model

```graphql
type Product @rootEntity {
    id: ID
    title: String
    textEmbedding: [Float] @vectorIndex(metric: COSINE, dimension: 768)
}
```

### Query

```graphql
query TextNearestProducts {
    vectorSearchProducts(field: textEmbedding, vector: [0.11, -0.23, 0.77, 0.04], first: 10) {
        id
        title
        _vectorScore
    }
}
```

What this gives you:

-   The same root list query (`allProducts`) you already use.
-   Vector ranking via `vectorNearest`.
-   `_vectorScore` for relevance inspection.
-   `first` for limiting result count.

> **Note**: specifying `orderBy` in a vector query is a runtime error. Ordering is fully determined
> by the metric (see section 4). For cursor-based pagination the usual stable tie-breaker rules
> apply (the system appends a sort key such as `ID_ASC` to make cursors deterministic).

## 2. Core proposal shape

### Index definition

Use `@vectorIndex` on a field to declare index parameters:

```graphql
@vectorIndex(
  sparse: Boolean = true
  metric: VectorSimilarityMetric!
  dimension: Int!
  nLists: Int           # optional; auto-computed from document count if omitted
  defaultNProbe: Int = 1
  trainingIterations: Int = 25
  factory: String
  storedValues: [String!]
)
```

Field restriction in this proposal:

-   The indexed field must be `[Float]`.

### Query usage

Use a dedicated top-level vector search query per root entity. The query is field-oriented and
accepts the vector plus optional tuning and filter arguments:

```graphql
# example signature for the entity `Product`
vectorSearchProducts(
    field: ProductVectorIndexField!
    vector: [Float!]!
    nProbe: Int
    minScore: Float
    maxDistance: Float
    filter: ProductFilter
    first: Int
): [Product]
```

## 3. Understanding `_vectorScore` and metric semantics

`_vectorScore` is intentionally metric-dependent:

-   `COSINE`: similarity, higher is better.
-   `INNER_PRODUCT`: similarity, higher is better.
-   `L2`: distance, lower is better.

Threshold semantics are metric-dependent as well:

-   `minScore` applies to similarity metrics (`COSINE`, `INNER_PRODUCT`).
-   For `COSINE`, values are bounded to `[-1, 1]`.
-   For `INNER_PRODUCT`, values are unbounded and scale-sensitive (vector magnitudes affect the
    score), so thresholds are model-specific and not directly comparable to cosine thresholds.
-   `maxDistance` applies to `L2` (distance metric).

This directly drives default ordering and valid threshold usage.

## 4. Add filtering

You can combine regular filters with vector search by passing a `filter` argument to the vector
search query:

```graphql
query TextNearestPublished {
    vectorSearchProducts(
        field: textEmbedding
        vector: [0.11, -0.23, 0.77, 0.04]
        nProbe: 20
        minScore: 0.72
        filter: { isPublished: true, category_in: ["books", "ebooks"] }
        first: 10
    ) {
        id
        title
        _vectorScore
    }
}
```

Ordering in vector mode is fixed and cannot be overridden via `orderBy` (runtime error if
attempted):

-   `COSINE`, `INNER_PRODUCT`: descending similarity.
-   `L2`: ascending distance.

Filtering + stored values note: ArangoDB `storedValues` on vector indexes are primarily for making
filtering/materialization during vector lookup more efficient.

## 5. Move to two vectors on one entity

When one embedding is not enough (for example text vs image retrieval), define two indexed fields:

```graphql
type Product @rootEntity {
    id: ID
    title: String
    textEmbedding: [Float] @vectorIndex(metric: COSINE, dimension: 768)
    imageEmbedding: [Float] @vectorIndex(metric: L2, dimension: 512)
}
```

Then choose the retrieval space per query using `vectorNearest.on`.

### Text-based nearest neighbors

```graphql
query TextNearest {
    vectorSearchProducts(
        field: textEmbedding
        vector: [0.3, -0.2, 0.1, 0.9]
        nProbe: 16
        minScore: 0.7
        first: 20
    ) {
        id
        _vectorScore
    }
}
```

### Image-based nearest neighbors

```graphql
query ImageNearest {
    vectorSearchProducts(
        field: imageEmbedding
        vector: [0.21, 0.02, -0.54, 0.18]
        nProbe: 32
        maxDistance: 1.45
        first: 20
    ) {
        id
        _vectorScore
    }
}
```

## 6. Advanced tuning knobs

### Index-time knobs

Use these in `@vectorIndex` for quality/performance tradeoffs:

-   `nLists` — optional. When omitted, auto-computed as `max(1, min(N, round(15 × sqrt(N))))` where
    `N` is the document count at index-creation time. Specify an explicit value to override the
    default, e.g. when you know your data distribution warrants more or fewer clusters.
-   `defaultNProbe`
-   `trainingIterations`
-   `factory`
-   `storedValues`

### Query-time knobs

Use these in the vector search query (e.g. `vectorSearchProducts`) per request:

-   `nProbe`
-   `minScore` for similarity metrics
-   `maxDistance` for distance metrics
-   `first`

`first` and `nProbe` have different roles:

-   `first` is translated to AQL `LIMIT` and controls the maximum response size.
-   `nProbe` controls search effort and recall.
-   `first` is not a recall guarantee. With approximate search and/or restrictive filtering, results
    can be fewer than requested.

## 7. Complete proposal example

```graphql
query SearchProducts($q: [Float!]!) {
    vectorSearchProducts(
        field: textEmbedding
        vector: $q
        nProbe: 24
        minScore: 0.68
        filter: { isPublished: true }
        first: 25
    ) {
        id
        title
        createdAt
        _vectorScore
    }
}
```

This is the end-to-end proposal in one flow: define `[Float]` vector fields with `@vectorIndex`,
then query nearest neighbors through `allProducts(..., vectorNearest: ...)` with regular filter
behavior.

## 8. Index lifecycle and migration behavior

ArangoDB vector indexes are trained on the data that exists at index-creation time. This section
explains the resulting lifecycle behavior and what to expect in the **Model Manager UI**.

### First deployment: index creation is deferred until data exists

Unlike regular persistent indexes, a vector index cannot be created on an empty collection. ArangoDB
trains IVF clusters during index creation; without documents there is nothing to train on.

Behavior when the collection is empty at migration time:

-   The create-index migration is not initially generated. in the Model Manager UI.
-   If `vectorNearest` is used while the index does not exist yet, a clear **runtime error** is
    returned.
-   After inserting the first batch of embeddings, you may need to **refresh migrations** in the
    Model Manager UI so it detects the new document count and generates the create-index migration.
    By default, this migration will then automatically run.
-   At the latest, the migration will be generated on the next scheduled analysis run (at least once
    per day).

### Automatic `nLists` and periodic reanalysis

When `nLists` is omitted, it is computed as `max(1, min(N, round(15 × sqrt(N))))` from the live
document count `N` at the time the analysis runs. The analyzer runs at least once per day.

If the document count has grown enough that the computed `nLists` would differ significantly from
the value used to build the current index (more than ~25%), a new drop-and-recreate migration is
generated and **applied automatically**. This keeps the index tuned to your data volume without any
schema change.

Note: rebuilding a vector index is an expensive operation on large collections. The ~25% threshold
exists precisely to avoid triggering a rebuild on every incremental document addition.

### Pinning index parameters without changing the schema

Because the model schema is shared across environments (dev → staging → production), you cannot
embed per-environment `nLists` values in the SDL. Auto-computation handles this for most cases. When
you need finer control — for example, keeping a production index stable while staging rebuilds
freely — you can: **mark a specific pending migration as ignored** in the Model Manager UI. The
migration will no longer appear as pending and will not be applied.

This lets a production database hold a manually-tuned index while the schema and automatic rebuild
behavior remain unchanged.

## 9. ANN caveats (important)

Vector search is approximate nearest-neighbor (ANN), not exact k-NN. Keep these expectations
explicit:

-   Recall/quality depends on index build parameters (`nLists`, training settings) and query-time
    effort (`nProbe`).
-   `first` maps to `LIMIT` (maximum rows returned), but ANN plus filtering can still yield fewer
    rows than requested.
-   Results are metric-dependent (`COSINE`/`INNER_PRODUCT` sort high-to-low, `L2` low-to-high), and
    using the wrong direction silently degrades nearest-neighbor quality.
