# Vector Index Migration — Technical Specification

> **Status**: Design document  
> **Scope**: ArangoDB vector index lifecycle — creation, zero-downtime recreation, stuck-slot
> recovery, status reporting

---

## 1. Overview

cruddl manages ArangoDB vector indexes declaratively. The model schema declares which fields have
vector indexes and their parameters; the migration system compares the desired state with the
database state and emits migration objects that the performer executes.

**Key invariants:**

1. **Zero downtime** — index recreation always uses A/B slot rotation so queries are never served by
   a missing or partially-trained index.
2. **Self-healing** — if a migration is interrupted at any point, the next analysis run detects the
   inconsistency and recovers without manual intervention.
3. **Compatibility** — the system works with ArangoDB ≥ 3.12.9 (explicit `trainingState` field on
   vector indexes) and older versions (where `ensureIndex` blocks until training completes).

---

## 2. Concepts

### 2.1 A/B Slot Naming

Every vector index occupies one of two **slots** per field:

| Slot | Index name pattern     |
| ---- | ---------------------- |
| A    | `vector_{fieldName}_a` |
| B    | `vector_{fieldName}_b` |

-   First-time creation always targets **slot A**.
-   Recreation targets the **opposite** slot. The old slot is dropped only after the new index
    reports `trainingState = "ready"` (or is ready implicitly on pre-3.12.9 versions).
-   At most two vector indexes may exist for the same field at the same time (one per slot).

### 2.2 nLists

`nLists` controls the number of IVF clusters in the vector index.

| Mode              | Behavior                                                                                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pinned**        | The model schema explicitly sets `nLists`. Any difference between existing and required triggers recreation.                                             |
| **Auto-computed** | `nLists` is derived from the document count: `max(1, min(N, round(15 × √N)))`. Recreation is triggered only when drift exceeds a configurable threshold. |

### 2.3 Vector Document Count (Sparse-Aware)

The **vector document count** (`vectorDocumentCount`) is the number of documents that contribute a
vector to a given index. Its calculation depends on the `sparse` flag:

| sparse  | Calculation method                                                                                                      |
| ------- | ----------------------------------------------------------------------------------------------------------------------- |
| `false` | `collection.count()` — every document contributes a vector                                                              |
| `true`  | AQL `FOR d IN col FILTER d.field != null COLLECT WITH COUNT INTO n` — only documents where the vector field is non-null |

`vectorDocumentCount` is used for nLists auto-computation and for the "deferred creation" guard.

### 2.4 Training State

| ArangoDB version | Behavior                                                                                             |
| ---------------- | ---------------------------------------------------------------------------------------------------- |
| ≥ 3.12.9         | `ensureIndex` returns immediately; the index reports `trainingState` (`"training"`, `"ready"`, etc.) |
| < 3.12.9         | `ensureIndex` blocks until training completes; no `trainingState` field on the index                 |

An index is considered **ready** when:

-   `trainingState` is `"ready"`, OR
-   `trainingState` is not present on the index object (pre-3.12.9 compatibility).

---

## 3. Configuration

The following `ArangoDBConfig` fields govern vector index behavior:

| Field                               | Type                  | Default     | Description                                                                                                                                  |
| ----------------------------------- | --------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `vectorIndexNListsRebuildThreshold` | `number \| undefined` | `undefined` | Fractional drift threshold for auto-computed nLists (e.g. `0.25` = 25%). When `undefined`, nLists drift never triggers automatic recreation. |
| `vectorIndexTrainingTimeoutMs`      | `number`              | `600_000`   | Maximum milliseconds to wait for a vector index to finish training before the migration fails.                                               |

---

## 4. Data Types

> **Vector indexes vs. persistent indexes.** Regular ArangoDB persistent indexes (used for standard
> query optimization) are managed by a completely separate code path and are not covered by this
> document. Do not conflate the two: they use different creation APIs (`ensureIndex` with
> `type: "vector"` vs. `type: "persistent"`), different naming conventions, and different status
> checks. All references to "index" in this document mean **vector index** unless explicitly stated
> otherwise.
>
> In the code, vector indices and persistent indices share very little code. The only common thing
> is that `DropIndexMigration` can drop either index.

### 4.1 VectorIndexDefinition (Required Index)

`VectorIndexDefinition` represents the **desired** index state derived from the model. It is
constructed by `analyzeField` (§6.1) and consumed by `computeVectorIndexStatus` (§6.2) and the
migration performer (§5.4).

| Field                       | Notes                        | Description                                       |
| --------------------------- | ---------------------------- | ------------------------------------------------- |
| `collectionName`            | required                     | ArangoDB collection name                          |
| `fields`                    | required (single element)    | Field name tuple                                  |
| `sparse`                    | required                     | Whether only non-null vectors are indexed         |
| `slot`                      | required (`"a"` \| `"b"`)    | Target slot; always `"a"` for first-time creation |
| `params.metric`             | required                     | `"cosine"` \| `"l2"` \| `"innerProduct"`          |
| `params.dimension`          | required                     | Vector dimensionality                             |
| `params.nLists`             | required (resolved — see §7) | Number of IVF clusters                            |
| `params.trainingIterations` | optional                     | Custom training iterations                        |
| `params.factory`            | optional                     | Custom factory string                             |
| `storedValues`              | optional                     | Fields co-located with vectors                    |

### 4.1.1 Existing Index Representation

Existing indexes are represented directly by the **arangojs index objects** returned from
`collection.indexes()`. There is no separate wrapper type.

### 4.2 VectorIndexStatusState (enum)

```typescript
enum VectorIndexStatusState {
    /** The existing index matches the model — no action needed. */
    UP_TO_DATE = 'UP_TO_DATE',
    /** No index exists, but the collection is empty — creation is deferred. */
    DEFERRED = 'DEFERRED',
    /** No index exists and the collection has data — creation is pending. */
    NEEDS_CREATE = 'NEEDS_CREATE',
    /** The existing index parameters differ from the model — recreation is pending. */
    NEEDS_RECREATE = 'NEEDS_RECREATE',
    /** Both A and B slots exist — stuck-slot cleanup is pending. */
    STUCK_CLEANUP = 'STUCK_CLEANUP',
    /**
     * The sole existing index is present but not yet ready (still training).
     * No correct ready index is available to serve queries.
     */
    TRAINING = 'TRAINING',
    /**
     * A correct, ready index exists and is serving queries.
     * A second slot is currently training (e.g. an in-progress forced recreation).
     * No action is required — wait for training to complete; the next analysis run will
     * perform stuck-slot cleanup via the tiebreaker (§6.4).
     */
    RETRAINING = 'RETRAINING',
}
```

### 4.3 VectorIndexStatus

```typescript
interface VectorIndexStatus {
    readonly rootEntityType: RootEntityType;
    readonly field: Field;
    readonly vectorIndex: VectorIndex;
    readonly collectionName: string;
    /** Number of documents contributing a vector to this index (sparse-aware — see §2.3). */
    readonly vectorDocumentCount: number;
    readonly computedNLists: number;
    readonly existingIndexInfo?: VectorIndexExistingInfo;
    readonly state: VectorIndexStatusState;
    readonly nListsDriftPercent?: number;
    /** Migrations needed to bring this field's index in sync with the model.
     * Empty when state is UP_TO_DATE, DEFERRED, TRAINING, or RETRAINING. */
    readonly migrations: ReadonlyArray<Migration>;
}

export interface VectorIndexExistingInfo {
    readonly name: string;
    readonly id: string;
    readonly nLists: number;
    readonly metric: string;
    readonly dimension: number;
    /**
     * Training state reported by ArangoDB 3.12.9+.
     * "ready" indicates the index has been fully trained and is usable.
     */
    readonly trainingState?: string;
}
```

`existingIndexInfo` contains the existing index's `name`, `id`, `nLists`, `metric`, `dimension`, and
`trainingState` when an index exists in the database.

### 4.4 Migration Classes

| Class                          | Type tag                | Description                                                                                            |
| ------------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------ |
| `CreateVectorIndexMigration`   | `"createVectorIndex"`   | First-time creation. Carries `requiredIndex` and `vectorDocumentCount`.                                |
| `RecreateVectorIndexMigration` | `"recreateVectorIndex"` | A/B slot rotation. Carries `existingIndex`, `requiredIndex`, and `vectorDocumentCount`.                |
| `DropIndexMigration`           | `"dropIndex"`           | Drops a single index (stuck-slot cleanup or field removal). Carries `index` and `vectorDocumentCount`. |

The two create/recreate classes exist so the caller (and log output) can distinguish a first-time
creation from a slot rotation — both are performed identically by the performer (see §5.4).

---

## 5. Public API

### 5.1 `ArangoDBAdapter.getVectorIndexStatus(field: Field): Promise<VectorIndexStatus>`

Returns the status of a single vector-indexed field.

**Algorithm** (delegates to the internal [analyzeField](#61-analyzefield) operation):

1. Validate that `field` has a vector index and belongs to a root entity type.
2. Call **analyzeField** (§6.1) with `forceRecreate = false`.
3. Return the resulting `VectorIndexStatus`.

### 5.2 `SchemaAnalyzer.getVectorIndexMigrations(model: Model): Promise<ReadonlyArray<Migration>>`

Returns all vector index migrations needed to bring the database in sync with the model.

**Algorithm:**

Two phases run completely independent of each other and do not share any data.

**Phase 1 — Per-field analysis:**

For each root entity type in the model, for each vector-indexed field on that type:

1. Call **analyzeField** (§6.1) with `forceRecreate = false`.
2. Collect `status.migrations` from the result.

There is no need to know existing vector indices up-front - this will be handled on a per-field
level in §6.1.

Note: This means we fetch existing indices multiple times - this is acceptable.

**Phase 2 — Orphaned index cleanup:**

For each root entity type in the model, fetch all existing vector indexes from ArangoDB for that
collection. For each existing vector index:

1. if it does not start with the prefix `vector_`, skip. (those are not managed by cruddl)
2. Look at the "fields" of the index (should only be one)
3. If the field name does not correspond to any vector-indexed field in the model for that
   collection: emit a `DropIndexMigration`

Return all collected migrations.

> **No deduplication needed between phases.** Phase 1 only visits fields that are declared in the
> model with a vector index; Phase 2 only drops indexes whose field name is _not_ declared in the
> model. The two working sets are disjoint by construction, so a `DropIndexMigration` emitted in
> Phase 1 (stuck-slot cleanup) can never refer to the same index as one emitted in Phase 2 (orphan
> cleanup), and vice versa.

### 5.3 `ArangoDBAdapter.recreateVectorIndex(field: Field): Promise<void>`

Force-rebuilds a vector index using A/B slot rotation, even if the current index matches the model.

**Algorithm:**

1. Validate that `field` has a vector index and belongs to a root entity type.
2. Call **analyzeField** (§6.1) with `forceRecreate = true`.
3. Execute `status.migrations` via the performer.

### 5.4 Migration Performer

#### `CreateVectorIndexMigration` and `RecreateVectorIndexMigration` execution

Both migration types are executed identically. `CreateVectorIndexMigration` is simply a
`RecreateVectorIndexMigration` where no existing index is present — the performer handles both with
the same logic:

1. **Determine the target slot** from `requiredIndex.slot` (`"a"` → `vector_{fieldName}_a`, `"b"` →
   `vector_{fieldName}_b`).
2. Call `ensureIndex` for the target slot, setting a slot-specific `defaultNProbe` (see §8.2).
3. Wait for the new index to become ready (poll `trainingState`; no-op on pre-3.12.9).
4. If `existingIndex` is present: drop it by ID. Ignore "index not found" errors — the index may
   have already been removed by a concurrent migration or a previous interrupted run. If
   `existingIndex` is absent (first-time creation): skip this step.

#### `DropIndexMigration` execution

1. Drop the index by ID. Ignore "index not found" errors (concurrent removal).

#### Training readiness polling

Poll `collection.indexes()` at a configurable interval (default 500 ms) until the named index
reports `trainingState = "ready"` or the `trainingState` field is absent (pre-3.12.9). Throw if
polling exceeds `vectorIndexTrainingTimeoutMs`.

---

## 6. Internal Operations

### 6.1 analyzeField _(non-pure — requires ArangoDB access and configuration)_

The shared entry point called by all three public API methods. Gathers all data from ArangoDB and
the configuration, then delegates to the pure **computeVectorIndexStatus** (§6.2) for all
decision-making. This operation has access to:

-   the arango database connection (to fetch indexes and document counts)
-   the `ArangoDBConfig` (for `nListsRebuildThreshold`)

**Input:**

-   `field: Field` — a field that has a vector index and belongs to a root entity type
-   `forceRecreate: boolean` — whether to force recreation even when parameters match

**Output:**

-   `VectorIndexStatus` — the complete status object, including `migrations`, returned as-is by
    `getVectorIndexStatus` and iterated by `getVectorIndexMigrations`

**Algorithm:**

1. Derive `collectionName` from the field's root entity type; derive `fieldName` from the field
   name.
2. Fetch all vector indexes for the collection from ArangoDB. Filter to `existingForField`: indexes
   whose `name` matches `vector_{fieldName}_a` or `vector_{fieldName}_b`.
    > **Collection does not exist yet:** If the collection does not yet exist in ArangoDB (e.g. it
    > has never been written to), treat it as if it exists but is empty: `existingForField = []` and
    > `vectorDocumentCount = 0`. The result will be a `DEFERRED` status, identical to an empty
    > collection — the index will be created once the collection has data.
3. Compute `vectorDocumentCount` (sparse-aware — see §2.3).
4. Build `requiredIndex` from the field's `VectorIndex` model definition, including the target
   `slot` (§4.1).
5. Resolve `nLists` and compute `computedNLists` (see §7); determine `nListsPinned` (whether
   `nLists` is explicitly set in the model).
6. Call **computeVectorIndexStatus** (§6.2) with all gathered inputs.
7. Return the resulting `VectorIndexStatus` (which already includes `migrations`).

---

### 6.2 computeVectorIndexStatus _(pure function — no I/O, all inputs explicit)_

**Input:**

-   `field: Field` — the field being analyzed; provides `rootEntityType`, `vectorIndex`,
    `collectionName` for assembling the output
-   `existingForField`: all vector indexes in the database that match this field (0, 1, or 2)
-   `requiredIndex`: the desired index definition (with nLists resolved and `slot` set)
-   `vectorDocumentCount`: number of documents contributing a vector (sparse-aware — see §2.3)
-   `computedNLists`: the resolved nLists value (see §7)
-   `nListsPinned`: whether nLists was explicitly set in the model
-   `nListsRebuildThreshold`: optional fractional drift threshold. Ignored when
    `nListsPinned = true` — pinned nLists always triggers recreation on any value difference
    regardless of drift (see §6.3 Needs Recreation).
-   `forceRecreate`: whether to force recreation even when params match

**Output:** `VectorIndexStatus` — the complete status object including `state`, `migrations`,
`existingIndexInfo` (derived from the surviving index after stuck-slot resolution), and
`nListsDriftPercent` (set when nLists drift is evaluated in §6.4).

**Algorithm:**

#### Step 1: Stuck-slot detection (both A and B exist)

Identify slot A and slot B from the existing indexes by parsing `index.name`.

If **both** A and B are present, resolve the stuck state:

Determine for each slot:

-   **matches**: does the index NOT need recreation (see
    [§6.3 Needs Recreation](#63-needs-recreation))?
-   **ready**: is `trainingState` absent or `"ready"`?

| A matches | B matches | A ready | B ready | Action                                                                                        |
| --------- | --------- | ------- | ------- | --------------------------------------------------------------------------------------------- |
| ✗         | ✓         | —       | ✓       | Drop A → status: `STUCK_CLEANUP`                                                              |
| ✗         | ✓         | —       | ✗       | Skip (B still training) → status: `TRAINING`                                                  |
| ✓         | ✓         | ✓       | ✓       | **Tiebreaker**: drop the index with the lower numeric ID (see §6.4) → status: `STUCK_CLEANUP` |
| ✓         | ✓         | mixed   | —       | No action (keeper is ready; other is training) → status: `RETRAINING`                         |
| —         | ✗         | ✓       | —       | Drop B → status: `STUCK_CLEANUP` (+ may also need recreate, see Step 2)                       |
| —         | ✗         | ✗       | —       | Skip (A still training) → status: `TRAINING`                                                  |

After resolving the stuck slot, at most one index survives. Proceed to Step 2.

#### Step 2: Create / Recreate decision (single surviving index or none)

Find the surviving index (the one not dropped in Step 1 that matches the field).

| Surviving index         | vectorDocumentCount | forceRecreate | needsRecreation | Action                                            |
| ----------------------- | ------------------- | ------------- | --------------- | ------------------------------------------------- |
| none                    | 0                   | —             | —               | No-op → `DEFERRED`                                |
| none                    | > 0                 | —             | —               | `CreateVectorIndexMigration` → `NEEDS_CREATE`     |
| present (any readiness) | —                   | true          | —               | `RecreateVectorIndexMigration` → `NEEDS_RECREATE` |
| present (any readiness) | —                   | false         | true            | `RecreateVectorIndexMigration` → `NEEDS_RECREATE` |
| present, **not ready**  | —                   | false         | false           | No-op → `TRAINING`                                |
| present, **ready**      | —                   | false         | false           | No-op → `UP_TO_DATE`                              |

> **`TRAINING` vs `RETRAINING`:** `TRAINING` (Step 2) means there is only one index slot and it is
> not yet ready — no correct index is available to serve queries. `RETRAINING` (Step 1) means two
> slots both have matching parameters, one is ready and serving, and the other is still training. In
> both cases no migrations are emitted.

**Migration parameters:**

-   **`CreateVectorIndexMigration`** — always targets **slot A** (`requiredIndex.slot = "a"`, name
    `vector_{fieldName}_a`). Carries `requiredIndex` and `vectorDocumentCount`.

-   **`RecreateVectorIndexMigration`** — targets the **opposite slot** from the surviving index: if
    the surviving index name ends in `_a`, `requiredIndex.slot = "b"` (name `vector_{fieldName}_b`),
    and vice versa. Carries `existingIndex` (the surviving index), `requiredIndex`, and
    `vectorDocumentCount`.

### 6.3 Needs Recreation

Compares an existing index against the required index. Returns `true` when any of:

1. **Core parameter change**: `metric`, `dimension`, or `sparse` differs.
2. **storedValues change**: sorted comparison of `storedValues` arrays (treating `undefined` as
   `[]`).
3. **nLists change (pinned)**: when `nListsPinned = true` and the values differ.
4. **nLists drift (auto-computed)**: when `nListsPinned = false`, a `nListsRebuildThreshold` is
   configured, and `|existing - required| / existing > threshold`.

Returns `false` in all other cases, including when either `nLists` value is unknown (`undefined`).

### 6.4 Stuck-Slot Tiebreaker (Both Match, Both Ready)

When both A and B exist, both match the required parameters, and both are ready, neither is clearly
stale. This typically happens when a parallel migration instance built B and is about to drop A.

**Pure resolution (no waiting, no DB re-fetch):**

1. Parse both `index.id` values. The expected format is `"collectionName/numericId"` (e.g.
   `"articles/461261886"`).
2. Extract the numeric part after the `/`.
3. If both parse successfully: **drop the index with the lower numeric ID** (keep the newer index).
   ArangoDB assigns monotonically increasing IDs, so the higher ID is the more recently created
   index — likely the replacement built by the parallel migration.
4. If either ID does not match the expected pattern: **drop B** (fallback — keep A as the canonical
   slot).

This replaces the previous wait-and-refresh approach, making the planner a pure function with no
async side effects for this case.

---

## 7. nLists Resolution

Before comparing an existing index against the model, the required index's `nLists` must be
resolved:

```
resolvedNLists = model.nLists ?? computeAutoNLists(vectorDocumentCount)
nListsPinned   = model.nLists != null

computeAutoNLists(N) = max(1, min(N, round(15 × √N)))
```

The `nListsPinned` flag controls which comparison mode is used in [§6.3](#63-needs-recreation).

---

## 8. ArangoDB Compatibility

### 8.1 trainingState handling

| Version  | ensureIndex behavior            | trainingState field                     | Handling                                                                                                                                 |
| -------- | ------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| < 3.12.9 | Blocks until training completes | Not present                             | Index is considered ready immediately after ensureIndex returns. `waitForVectorIndexReady` returns immediately when the field is absent. |
| ≥ 3.12.9 | Returns immediately             | Present (`"training"`, `"ready"`, etc.) | `waitForVectorIndexReady` polls at a configurable interval until `"ready"` or timeout.                                                   |

### 8.2 ensureIndex deduplication and slot-pinned defaultNProbe

ArangoDB's `ensureIndex` for vector indexes deduplicates by `fields` + `params` — even when a
different `name` is requested, ArangoDB returns the existing index unchanged instead of creating a
new one in the target slot.

This means that when the `forceRecreate` flag triggers a `RecreateVectorIndexMigration` and the
existing index already has the correct parameters, a naive `ensureIndex` call would silently no-op:
no new index would be created in the opposite slot, and the A/B rotation would fail.

To prevent this, the performer pins `defaultNProbe` deterministically by slot:

-   **Slot A → `defaultNProbe: 1`**
-   **Slot B → `defaultNProbe: 2`**

Because `defaultNProbe` is part of ArangoDB's dedup key, the two slots always have distinct
`params`, so `ensureIndex` always creates a genuinely new index in the target slot — even when all
other parameters are identical. This guarantees zero-downtime A/B rotation in every case.

`defaultNProbe` is **not used by cruddl for query execution**: nProbe is passed at query time and
does not depend on the index's stored default. The slot-pinned value is therefore invisible to
business logic, and is also invisible to the planning layer — `vectorIndexNeedsRecreation` does not
compare `defaultNProbe`, so normal stability checks are unaffected.

---

## 9. Recovery Scenarios

The system must self-heal from any interruption point. The table below enumerates the possible
database states and the expected planner behavior.

### 9.1 Single-slot states

| State                       | Description                            | Planner output                 |
| --------------------------- | -------------------------------------- | ------------------------------ |
| No index, empty collection  | Collection exists but has no documents | No migration (deferred)        |
| No index, has documents     | Collection has data, no vector index   | `CreateVectorIndexMigration`   |
| A exists, matches, ready    | Normal healthy state                   | No migration                   |
| A exists, matches, training | Index being trained (≥ 3.12.9)         | No migration (wait for ready)  |
| A exists, doesn't match     | Parameters changed in model            | `RecreateVectorIndexMigration` |
| B exists, matches, ready    | B survived from a previous recovery    | No migration                   |
| B exists, doesn't match     | Parameters changed in model            | `RecreateVectorIndexMigration` |

### 9.2 Dual-slot states (stuck)

These occur when a previous migration was interrupted between creating the new index and dropping
the old one.

| A state  | B state  | A matches | B matches | Action                                                           |
| -------- | -------- | --------- | --------- | ---------------------------------------------------------------- |
| ready    | ready    | ✓         | ✗         | Drop B                                                           |
| ready    | ready    | ✗         | ✓         | Drop A                                                           |
| ready    | ready    | ✗         | ✗         | Drop B, then recreate A                                          |
| ready    | ready    | ✓         | ✓         | Tiebreaker: drop lower-ID index                                  |
| ready    | training | ✓         | ✗         | Drop B                                                           |
| ready    | training | ✗         | ✓         | No action (B still training — wait for next run)                 |
| ready    | training | ✓         | ✓         | No action (A is ready and serving; B is training) → `RETRAINING` |
| training | ready    | ✓         | ✗         | No action (A still training — wait for next run)                 |
| training | ready    | ✗         | ✓         | Drop A — wait, no: A is training. No action (wait for next run)  |
| training | \*       | —         | —         | No action (wait for next run)                                    |

**General rule for training states:** Never drop an index when the slot we intend to keep is still
training. The training slot may fail, leaving no usable index. Always wait for the next analysis
run.

**Correction for "B matches, A doesn't match, B training":** Even though B has the right params, we
cannot drop A because B is not yet usable. Return no migrations; the next run after B finishes
training will handle cleanup.

**Correction for "A doesn't match, B matches, A training":** A is still training but it doesn't
match. B matches and is ready. We could drop A (it's wrong anyway), but since A is still occupying
resources, the conservative approach is to wait until A finishes training, then drop it. However,
since B is ready and correct, it's safe to drop A immediately — **if B is ready, we CAN drop A
regardless of A's training state, because B can serve queries.**

Revised rule:

-   To drop slot X, the **other** slot (the one we keep) must be **ready**.
-   If the keeper slot is still training, do nothing.

### 9.3 Field removal

When a vector index field is removed from the model, `analyzeField` (§6.1) is **never called** for
that field — it is no longer in the model, so neither Phase 1 of `getVectorIndexMigrations` nor any
other API method touches it.

Cleanup is handled entirely by **Phase 2** of `getVectorIndexMigrations` (§5.2): for each existing
vector index whose field name does not correspond to any vector-indexed field in the current model,
a `DropIndexMigration` is emitted. If both slots (A and B) exist for the removed field, Phase 2
emits a separate `DropIndexMigration` for each.

---

## 10. Shared Logic Between API Methods

To satisfy the maintainability requirement, all API methods delegate to a small set of internal
operations:

```
┌──────────────────────────┐
│  getVectorIndexStatus()  │──→ analyzeField() ──→ return status
└──────────────────────────┘

┌──────────────────────────────────┐
│  getVectorIndexMigrations()      │──→ for each field: analyzeField()
│                                  │    + collect status.migrations
│                                  │    + drop orphaned indexes
└──────────────────────────────────┘

┌──────────────────────────┐
│  recreateVectorIndex()   │──→ analyzeField(forceRecreate=true)
│                          │    + execute status.migrations
└──────────────────────────┘
```

`analyzeField` (§6.1, non-pure) fetches data from ArangoDB and delegates all decisions to
`computeVectorIndexStatus` (§6.2, pure), which is the **single source of truth** for:

-   stuck-slot resolution
-   create/recreate/up-to-date/deferred decisions
-   nLists resolution and drift detection

---

## 11. Test Coverage

### 11.1 Integration tests (`vector-index-migrations.spec.ts`)

These tests use a real ArangoDB instance and exercise the full pipeline (analyzer → performer →
verify database state).

| Category             | Tests                                                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Deferred creation    | Empty collection → no migration; with docs → CreateVectorIndexMigration                                                                                                  |
| First-time creation  | Creates in slot A; stable after creation                                                                                                                                 |
| Metric change        | Schedules RecreateVectorIndexMigration; A→B slot swap; A→B→A cycle                                                                                                       |
| Other param changes  | dimension change, sparse flag change, pinned nLists change, storedValues change                                                                                          |
| nLists drift         | No recreation without threshold; recreation when drift exceeds threshold                                                                                                 |
| Field removal        | DropIndexMigration; stable after drop                                                                                                                                    |
| Stuck recovery (A+B) | Drop B when both same; drop A when B is correct (L2); stable after recovery; B training delays cleanup; neither matches → drop B + recreate A; field removed → drop both |
| Performer resilience | Dropping already-removed index does not throw                                                                                                                            |

### 11.2 Integration tests (`vector-index-performance.spec.ts`)

| Test                 | Description                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| End-to-end lifecycle | Train index, detect nLists drift, rebuild, continuously query during rebuild, verify zero-downtime |

### 11.3 Adapter integration tests (`arangodb-adapter.spec.ts`)

| Test                                  | Description                                                       |
| ------------------------------------- | ----------------------------------------------------------------- |
| recreateVectorIndex: no index         | Creates in slot A                                                 |
| recreateVectorIndex: force rebuild    | Rebuilds via A/B rotation even when params match (ends in slot B) |
| recreateVectorIndex: empty collection | Throws                                                            |

### 11.4 Coverage gaps to address

The following scenarios are tested by unit tests being removed but NOT by existing integration
tests. New integration tests must be added:

| #   | Scenario                                                        | Currently in               | Action                                                                        |
| --- | --------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------- |
| 1   | Both match, both ready → tiebreaker drops lower-ID index (§6.4) | `planner.spec.ts`          | Add integration test                                                          |
| 2   | Both match, one still training → no action                      | `planner.spec.ts`          | Add integration test                                                          |
| 3   | A still training, B doesn't match → no action (wait)            | `planner.spec.ts`          | Add integration test                                                          |
| 4   | forceRecreate + no existing index → CreateVectorIndexMigration  | `planner.spec.ts`          | Covered by adapter.spec.ts "creates the index in slot A when no index exists" |
| 5   | nLists drift below threshold → no recreation                    | `analyzer-helpers.spec.ts` | Add integration test (seed with moderate doc count)                           |

---

## 12. Appendix: Index ID Format

ArangoDB assigns index IDs in the format `"collectionName/numericId"` where `numericId` is a
monotonically increasing integer. Examples:

```
"articles/461261886"
"articles/461261887"
```

The tiebreaker in §6.4 relies on this format to determine which index is newer (higher numeric ID).
The numeric part is extracted by splitting on `"/"` and parsing the second segment as an integer.

If the format changes in future ArangoDB versions, the fallback behavior (drop B) ensures
correctness, though the tiebreaker loses its "keep newer" semantics.
