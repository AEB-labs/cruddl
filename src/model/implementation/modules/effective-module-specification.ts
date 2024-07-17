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
     * Sorts the clauses by name and removes duplicates
     */
    simplify(): EffectiveModuleSpecification {
        const map = new Map(
            this.orCombinedClauses.map((clause) => {
                const normalized = clause.normalize();
                return [normalized.toString(), normalized];
            }),
        );
        const keys = Array.from(map.keys()).sort();
        const normalizedClauses = keys.map((k) => map.get(k)!);
        return new EffectiveModuleSpecification({ orCombinedClauses: normalizedClauses });
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
        return this.andCombinedModules.join(' && ');
    }
}
