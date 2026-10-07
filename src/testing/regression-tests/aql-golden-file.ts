import { formatWhitespaceInFile } from '../utils/format-whitespace-in-file.js';

/**
 * The exact ArangoDB versions the regression tests are run against, in ascending order.
 *
 * Keep this in sync with the `arango-image` matrix in `.github/workflows/test.yml` (which is why
 * those images are pinned to exact patch versions).
 *
 * The AQL we generate is the same for all these versions (unless we explicitly generate different
 * AQL for different versions), but the peak memory usage reported by ArangoDB regularly changes
 * between patch versions. AQL files therefore record the peak memory usage either as a single value
 * (if it is the same for all tested versions) or as one value per tested version. Values of
 * versions that are not listed here are dropped when the expected files are updated, and they make
 * the tests fail until then.
 */
export const TESTED_ARANGODB_VERSIONS: ReadonlyArray<string> = ['3.12.6', '3.12.11'];

export const TRANSACTION_STEP_SEPARATOR =
    '\n\n// ----------------------------------------------------------------\n\n';

const PEAK_MEMORY_USAGE_REGEXP = /^\/\/ Peak memory usage: (\d+) bytes$/;
const PEAK_MEMORY_USAGE_OF_VERSION_REGEXP =
    /^\/\/ Peak memory usage \(arangodb (\d+(?:\.\d+)*)\): (\d+) bytes$/;

/**
 * One transaction step (i.e. one AQL query with its annotations) of an AQL file
 */
export interface AqlGoldenTransactionStep {
    readonly query: string;

    /**
     * The expected peak memory usage in bytes by ArangoDB version, empty if the AQL file does not
     * record the peak memory usage of this query
     */
    readonly peakMemoryUsageByVersion: ReadonlyMap<string, number>;
}

/**
 * One transaction step as it was actually executed
 */
export interface ActualTransactionStep {
    readonly query: string;

    /** The peak memory usage in bytes, or `undefined` if ArangoDB did not report it */
    readonly peakMemoryUsage: number | undefined;
}

export function parseAqlGoldenFile(content: string): ReadonlyArray<AqlGoldenTransactionStep> {
    return content.split(TRANSACTION_STEP_SEPARATOR).map(parseTransactionStep);
}

/**
 * Serializes the queries of transaction steps without the peak memory usage annotations
 *
 * This is the part of an AQL file that is compared verbatim - the peak memory usage is compared
 * separately because it depends on the ArangoDB version.
 */
export function serializeQueries(steps: ReadonlyArray<{ readonly query: string }>): string | null {
    if (!steps.length) {
        return null;
    }
    return formatWhitespaceInFile(
        steps.map((step) => normalizeQuery(step.query)).join(TRANSACTION_STEP_SEPARATOR),
    );
}

/**
 * Builds the new content of an AQL file, keeping the recorded peak memory usage of the ArangoDB
 * versions that are currently not being tested against
 *
 * If the query of a transaction step changed, the peak memory usage of the other versions is kept
 * even though it is likely to be outdated - the tests on those versions will then report the actual
 * value so it can be recorded without having to run all versions locally.
 */
export function buildUpdatedAqlGoldenFile({
    actualSteps,
    goldenSteps,
    arangoDBVersion,
}: {
    readonly actualSteps: ReadonlyArray<ActualTransactionStep>;
    readonly goldenSteps: ReadonlyArray<AqlGoldenTransactionStep> | undefined;
    readonly arangoDBVersion: string | undefined;
}): string {
    const steps = actualSteps.map((actualStep, index) => {
        const peakMemoryUsageByVersion = new Map(
            goldenSteps?.[index]?.peakMemoryUsageByVersion ?? [],
        );
        // if we're running a version we don't have golden values for, keep the recorded values
        if (arangoDBVersion && TESTED_ARANGODB_VERSIONS.includes(arangoDBVersion)) {
            if (actualStep.peakMemoryUsage === undefined) {
                peakMemoryUsageByVersion.delete(arangoDBVersion);
            } else {
                peakMemoryUsageByVersion.set(arangoDBVersion, actualStep.peakMemoryUsage);
            }
        }
        return { query: normalizeQuery(actualStep.query), peakMemoryUsageByVersion };
    });
    return formatWhitespaceInFile(
        steps.map(serializeTransactionStep).join(TRANSACTION_STEP_SEPARATOR),
    );
}

/**
 * Compares the peak memory usage recorded in an AQL file with the one of the actual execution
 *
 * Returns one message per problem (empty if everything matches). Only checks the version we're
 * currently running against - the values of the other versions are checked by the CI jobs of those
 * versions.
 */
export function getPeakMemoryUsageErrors({
    actualSteps,
    goldenSteps,
    arangoDBVersion,
}: {
    readonly actualSteps: ReadonlyArray<ActualTransactionStep>;
    readonly goldenSteps: ReadonlyArray<AqlGoldenTransactionStep>;
    readonly arangoDBVersion: string | undefined;
}): ReadonlyArray<string> {
    if (!arangoDBVersion || !TESTED_ARANGODB_VERSIONS.includes(arangoDBVersion)) {
        // we don't have golden values for this version (see the warning logged on startup)
        return [];
    }

    // if the queries differ, the peak memory usage is expected to differ as well - only report the
    // query difference in that case
    //
    // this deliberately uses serializeQueries(), i.e. exactly the values that are compared to
    // report that difference: if it compared the queries in any other way, the two comparisons
    // could disagree, and a difference that is not reported here would not be reported at all
    if (
        actualSteps.length !== goldenSteps.length ||
        serializeQueries(actualSteps) !== serializeQueries(goldenSteps)
    ) {
        return [];
    }

    const errors: string[] = [];

    const staleVersions = new Set(
        goldenSteps
            .flatMap((step) => [...step.peakMemoryUsageByVersion.keys()])
            .filter((version) => !TESTED_ARANGODB_VERSIONS.includes(version)),
    );
    for (const version of staleVersions) {
        errors.push(
            `Peak memory usage is recorded for arangodb ${version}, but that version is not tested anymore`,
        );
    }

    for (let index = 0; index < actualSteps.length; index++) {
        const location = actualSteps.length > 1 ? ` in transaction step ${index + 1}` : '';
        const expectedBytes = goldenSteps[index].peakMemoryUsageByVersion.get(arangoDBVersion);
        const actualBytes = actualSteps[index].peakMemoryUsage;

        if (expectedBytes === actualBytes) {
            continue;
        }
        if (expectedBytes === undefined) {
            errors.push(
                `Peak memory usage${location} is not recorded for arangodb ${arangoDBVersion} (it is ${actualBytes} bytes)`,
            );
        } else if (actualBytes === undefined) {
            errors.push(
                `Peak memory usage${location} is recorded as ${expectedBytes} bytes for arangodb ${arangoDBVersion}, but the query did not report a peak memory usage`,
            );
        } else {
            const change = actualBytes > expectedBytes ? 'increased' : 'decreased';
            errors.push(
                `Peak memory usage${location} ${change} from ${expectedBytes} to ${actualBytes} bytes on arangodb ${arangoDBVersion}`,
            );
        }
    }

    return errors;
}

/**
 * Removes whitespace that is not preserved in the AQL files
 *
 * Trailing whitespace is removed when the files are written (see {@link formatWhitespaceInFile}),
 * so the queries have to be normalized before they can be compared to the recorded ones.
 */
function normalizeQuery(query: string): string {
    return trimEnd(
        query
            .split('\n')
            .map((line) => line.replace(/\s+$/, ''))
            .join('\n'),
    );
}

function parseTransactionStep(text: string): AqlGoldenTransactionStep {
    const lines = trimEnd(text).split('\n');
    const peakMemoryUsageByVersion = new Map<string, number>();
    while (lines.length) {
        const line = lines[lines.length - 1];

        const ofVersionMatch = PEAK_MEMORY_USAGE_OF_VERSION_REGEXP.exec(line);
        if (ofVersionMatch) {
            peakMemoryUsageByVersion.set(ofVersionMatch[1], parseInt(ofVersionMatch[2], 10));
            lines.pop();
            continue;
        }

        const match = PEAK_MEMORY_USAGE_REGEXP.exec(line);
        if (match) {
            // a value without a version applies to all tested versions
            // (values of specific versions are parsed first because they're below this line)
            const bytes = parseInt(match[1], 10);
            for (const version of TESTED_ARANGODB_VERSIONS) {
                if (!peakMemoryUsageByVersion.has(version)) {
                    peakMemoryUsageByVersion.set(version, bytes);
                }
            }
            lines.pop();
            continue;
        }

        break;
    }

    return { query: normalizeQuery(lines.join('\n')), peakMemoryUsageByVersion };
}

function serializeTransactionStep(step: AqlGoldenTransactionStep): string {
    const annotations = serializePeakMemoryUsage(step.peakMemoryUsageByVersion);
    return annotations ? `${step.query}\n\n${annotations}` : step.query;
}

function serializePeakMemoryUsage(peakMemoryUsageByVersion: ReadonlyMap<string, number>): string {
    // iterating over TESTED_ARANGODB_VERSIONS discards values of versions that are not tested
    // anymore and keeps the order stable
    const versions = TESTED_ARANGODB_VERSIONS.filter((version) =>
        peakMemoryUsageByVersion.has(version),
    );
    if (!versions.length) {
        return '';
    }

    const values = versions.map((version) => peakMemoryUsageByVersion.get(version));
    // collapse to a single value if all tested versions agree, so this only gets verbose where the
    // versions actually differ
    if (
        versions.length === TESTED_ARANGODB_VERSIONS.length &&
        values.every((value) => value === values[0])
    ) {
        return `// Peak memory usage: ${values[0]} bytes`;
    }
    return versions
        .map(
            (version) =>
                `// Peak memory usage (arangodb ${version}): ${peakMemoryUsageByVersion.get(version)} bytes`,
        )
        .join('\n');
}

function trimEnd(s: string) {
    return s.replace(/\s+$/, '');
}
