export interface EffectiveModuleSpecificationConfig {
    readonly orCombinedClauses: ReadonlyArray<EffectiveModuleSpecificationClauseConfig>;
}

export interface EffectiveModuleSpecificationClauseConfig {
    readonly andCombinedModules: ReadonlyArray<string>;
}

export class EffectiveModuleSpecification {
    readonly orCombinedClauses: ReadonlyArray<EffectiveModuleSpecificationClause>;

    constructor(config: EffectiveModuleSpecificationConfig) {
        this.orCombinedClauses = config.orCombinedClauses.map(
            (c) => new EffectiveModuleSpecificationClause(c),
        );
    }

    static readonly EMPTY = new EffectiveModuleSpecification({ orCombinedClauses: [] });

    /**
     * Checks if a field / type with this module specification is included in a model where the given modules are selected
     */
    includedIn(selectedModules: ReadonlyArray<string> | ReadonlySet<string>) {
        if (!this.orCombinedClauses) {
            return false;
        }

        return this.orCombinedClauses.some((clause) => clause.includedIn(selectedModules));
    }

    /**
     * Sorts the clauses by name and removes duplicates and redundant clauses (e.g. ["a", "a && b"] is simplified to ["a"])
     */
    simplify(): EffectiveModuleSpecification {
        // sort by length so we prefer shorter clauses
        // sort by toString() secondarily to get a normalized representation
        const clausesSortedByLength = this.orCombinedClauses
            .map((c) => c.normalize())
            .sort((a, b) => a.toString().localeCompare(b.toString()))
            .sort((a, b) => a.andCombinedModules.length - b.andCombinedModules.length);
        const nonRedundantClauses: EffectiveModuleSpecificationClause[] = [];
        // this has quadratic runtime w.r.t. number atoms, but we don't expect huge module specifications
        for (const clause of clausesSortedByLength) {
            const modulesInClause = new Set(clause.andCombinedModules);
            let clauseIsRedundant = false;
            for (const existingClause of nonRedundantClauses) {
                if (existingClause.andCombinedModules.every((m) => modulesInClause.has(m))) {
                    // existingClause implies clause
                    clauseIsRedundant = true;
                    break;
                }
            }
            if (!clauseIsRedundant) {
                nonRedundantClauses.push(clause);
            }
        }

        return new EffectiveModuleSpecification({ orCombinedClauses: nonRedundantClauses });
    }

    orCombineWith(other: EffectiveModuleSpecification) {
        const combined = new EffectiveModuleSpecification({
            orCombinedClauses: [...this.orCombinedClauses, ...other.orCombinedClauses],
        });
        return combined.simplify();
    }

    andCombineWith(other: EffectiveModuleSpecification) {
        const clauses: EffectiveModuleSpecificationClauseConfig[] = [];
        for (const aClause of this.orCombinedClauses) {
            for (const bClause of other.orCombinedClauses) {
                clauses.push({
                    andCombinedModules: [
                        ...aClause.andCombinedModules,
                        ...bClause.andCombinedModules,
                    ],
                });
            }
        }

        const combined = new EffectiveModuleSpecification({
            orCombinedClauses: clauses,
        });
        return combined.simplify();
    }

    /**
     * Checks if this specification states that the object is not included in any module
     */
    isEmpty() {
        return this.orCombinedClauses.length === 0;
    }

    toString() {
        return this.orCombinedClauses.map((c) => c.toString()).join(', ');
    }
}

export class EffectiveModuleSpecificationClause {
    readonly andCombinedModules: ReadonlyArray<string>;
    constructor(config: EffectiveModuleSpecificationClauseConfig) {
        if (!config.andCombinedModules.length) {
            throw new Error(
                `andCombinedModules in EffectiveModuleSpecificationClause cannot be empty`,
            );
        }

        this.andCombinedModules = config.andCombinedModules;
    }

    /**
     * Checks all the modules in this clause are present in the given selected modules
     */
    includedIn(selectedModules: ReadonlyArray<string> | ReadonlySet<string>) {
        const selectedModuleSet =
            selectedModules instanceof Set ? selectedModules : new Set(selectedModules);
        for (const module of this.andCombinedModules) {
            if (!selectedModuleSet.has(module)) {
                return false;
            }
        }
        return true;
    }

    /**
     * Sorts the modules by name and removes duplicates
     */
    normalize(): EffectiveModuleSpecificationClause {
        const normalizedIdentifiers = Array.from(new Set(this.andCombinedModules.slice().sort()));
        return new EffectiveModuleSpecificationClause({
            andCombinedModules: normalizedIdentifiers,
        });
    }

    toString() {
        return this.andCombinedModules.join(' & ');
    }
}
