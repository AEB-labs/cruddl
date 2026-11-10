import { writeFileSync } from 'fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isArangoDBDisabled } from '../../../arangodb/testing/is-arangodb-disabled.js';
import type { Difference, DifferentialContext, FilterTarget } from './differential-runner.js';
import {
    checkFilterOnArangoDB,
    compareFilter,
    createArangoDBAdapter,
    createInMemoryAdapter,
    createProject,
    createTimings,
    describeTarget,
    dropArangoDBDatabase,
    findFilterTargets,
    insertTestData,
    isSupportedByInMemoryAdapter,
    runConcurrently,
} from './differential-runner.js';
import { collectValuePools, FilterGenerator } from './filter-generator.js';
import { KNOWN_DIFFERENCES } from './known-differences.js';
import { TEST_DATA } from './test-data.js';

/**
 * Differential test of filters on list fields
 *
 * Generates filters from the filter input types of the schema, runs them on every list field of
 * the model (and on the root queries) with the InMemoryAdapter and with ArangoDB and expects the
 * same results. Each filter is applied on the list itself, on the _Meta count, ordered, and with
 * skip and first.
 *
 * Differences listed in known-differences.ts are tolerated, but each of them needs to occur.
 *
 * Set CRUDDL_DIFFERENTIAL_REPORT to a file path to write all differences as JSON.
 */
const MAX_TARGETS_PER_QUERY = 4;
const CONCURRENCY = 4;

function chunk<T>(items: ReadonlyArray<T>, size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks;
}

describe.skipIf(isArangoDBDisabled())(
    'filters on list fields (InMemoryAdapter vs. ArangoDB)',
    () => {
        const project = createProject();
        const generatorSchema = project.createSchema(createInMemoryAdapter());
        const filterGenerator = new FilterGenerator({
            schema: generatorSchema,
            valuePools: collectValuePools(TEST_DATA.entities),
            maxDepth: 3,
            maxNestedFiltersPerField: 8,
        });
        const targetsByFilterType = new Map<string, FilterTarget[]>();
        for (const target of findFilterTargets(generatorSchema, 3)) {
            const list = targetsByFilterType.get(target.filterTypeName) ?? [];
            list.push(target);
            targetsByFilterType.set(target.filterTypeName, list);
        }

        let context: DifferentialContext;
        const allDifferences: Difference[] = [];

        beforeAll(async () => {
            const inMemoryAdapter = createInMemoryAdapter();
            await inMemoryAdapter.updateSchema(project.getModel());
            const inMemorySchema = project.createSchema(inMemoryAdapter);
            const arangoDBSchema = project.createSchema(await createArangoDBAdapter(project));
            await insertTestData(inMemorySchema, TEST_DATA);
            await insertTestData(arangoDBSchema, TEST_DATA);
            context = { inMemorySchema, arangoDBSchema, timings: createTimings() };
        }, 60_000);

        afterAll(async () => {
            if (process.env.CRUDDL_DIFFERENTIAL_REPORT) {
                writeFileSync(
                    process.env.CRUDDL_DIFFERENTIAL_REPORT,
                    JSON.stringify(
                        {
                            timings: context.timings,
                            differences: allDifferences.map((d) => ({
                                knownDifference: KNOWN_DIFFERENCES.find((k) => k.matches(d))?.id,
                                ...d,
                            })),
                        },
                        undefined,
                        2,
                    ),
                );
            }
            await dropArangoDBDatabase();
        });

        for (const [filterTypeName, targets] of targetsByFilterType) {
            it(`${filterTypeName} on ${targets.length} fields`, { timeout: 60_000 }, async () => {
                const filters = filterGenerator.generate(filterTypeName);

                const comparableTargets: FilterTarget[] = [];
                const arangoDBOnlyTargets: FilterTarget[] = [];
                for (const target of targets) {
                    if (await isSupportedByInMemoryAdapter(context.inMemorySchema, target)) {
                        comparableTargets.push(target);
                    } else {
                        arangoDBOnlyTargets.push(target);
                    }
                }

                // ArangoDB takes much longer for queries with many list fields (one query with 16 takes
                // seconds, four queries with four take milliseconds), so split them up
                const comparableChunks = chunk(comparableTargets, MAX_TARGETS_PER_QUERY);
                const arangoDBOnlyChunks = chunk(arangoDBOnlyTargets, MAX_TARGETS_PER_QUERY);
                const start = performance.now();
                const results = await runConcurrently(
                    filters.flatMap((filter) => [
                        ...comparableChunks.map(
                            (targetChunk) => () => compareFilter(context, targetChunk, filter),
                        ),
                        ...arangoDBOnlyChunks.map(
                            (targetChunk) => () =>
                                checkFilterOnArangoDB(context, targetChunk, filter),
                        ),
                    ]),
                    CONCURRENCY,
                );
                const differences = results.flat();
                allDifferences.push(...differences);
                const unknownDifferences = differences.filter(
                    (d) => !KNOWN_DIFFERENCES.some((k) => k.matches(d)),
                );

                console.log(
                    [
                        `${filterTypeName}: ${filters.length} filters in ${Math.round(performance.now() - start)}ms, ` +
                            `${differences.length} differences (${unknownDifferences.length} unknown)`,
                        `compared: ${comparableTargets.map(describeTarget).join(', ')}`,
                        `only checked for errors on ArangoDB: ${arangoDBOnlyTargets.map(describeTarget).join(', ') || '-'}`,
                    ].join('\n'),
                );

                // only show the first few, there can be hundreds
                expect({
                    count: unknownDifferences.length,
                    first: unknownDifferences.slice(0, 5),
                }).toEqual({ count: 0, first: [] });
            });
        }

        it('still has all known differences', () => {
            const timings = context.timings;
            console.log(
                `time spent in InMemoryAdapter: ${Math.round(timings.inMemoryInMs)}ms, ` +
                    `in ArangoDB: ${Math.round(timings.arangoDBInMs)}ms, slowest:\n` +
                    timings.slowest
                        .map(
                            (s) =>
                                `${Math.round(s.durationInMs)}ms ${s.adapter} ${JSON.stringify(s.filter)}`,
                        )
                        .join('\n'),
            );
            const counts = KNOWN_DIFFERENCES.map((known) => ({
                id: known.id,
                occurrences: allDifferences.filter((d) => known.matches(d)).length,
            }));
            console.log(counts.map((c) => `${c.id}: ${c.occurrences}`).join('\n'));
            expect(counts.filter((c) => c.occurrences === 0).map((c) => c.id)).toEqual([]);
        });
    },
);
