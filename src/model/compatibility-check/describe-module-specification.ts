import { Field, Type } from '../implementation';
import { EffectiveModuleSpecification } from '../implementation/modules/effective-module-specification';

export function getRequiredBySuffix(component: Type | Field) {
    const desc = describeModuleSpecification(component.effectiveModuleSpecification);
    if (!desc) {
        return '';
    }
    return ` (required ${desc})`;
}

export function describeModuleSpecification(
    moduleSpecification: EffectiveModuleSpecification,
): string {
    let description = '';

    // modules that only consist of one module each (e.g. "shipping")
    const simpleClauses = moduleSpecification.orCombinedClauses.filter(
        (c) => c.andCombinedModules.length === 1,
    );
    // module combinations like "shipping and dangerous_goods"
    // (note that there are no clauses where andCombinedModules.length is zero)
    const combinationClauses = moduleSpecification.orCombinedClauses.filter(
        (c) => c.andCombinedModules.length > 1,
    );

    if (simpleClauses.length) {
        // "by module a and b" seems more natural than "by modules a and b"
        description = `by module ${describeModules(
            simpleClauses.map((c) => c.andCombinedModules[0]),
        )}`;
    }

    for (const clause of combinationClauses) {
        // add combiner
        if (description) {
            description += ', and ';
        }

        description += `by the combination of module ${describeModules(clause.andCombinedModules)}`;
    }

    return description;
}

function describeModules(modules: ReadonlyArray<string>) {
    if (!modules.length) {
        throw new Error(`Expected modules not to be empty`);
    }
    if (modules.length === 1) {
        return describeModule(modules[0]);
    }
    if (modules.length === 2) {
        // even though the clauses are or-combined, we use the phrase "and" here
        // this is because the term "this field is required by thingA and thingB" means
        // that it is required by both of them (using "or" would seem like an uncertainty)
        return describeModule(modules[0]) + ' and ' + describeModule(modules[1]);
    }

    const describedModules = modules.map((m) => describeModule(m));
    const lastPart = describedModules[describedModules.length - 1];
    const firstPart = describedModules.slice(0, describedModules.length - 1).join(', ');
    return `${firstPart} and ${lastPart}`;
}

function describeModule(module: string) {
    return '"' + module + '"';
}
