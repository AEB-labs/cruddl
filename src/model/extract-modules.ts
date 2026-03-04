import type { ModelOptions } from '../config/interfaces.js';
import type { ParsedObjectProjectSource } from '../schema/parsing/parsed-project.js';
import { isReadonlyArray } from '../utils/utils.js';
import type { ModuleConfig } from './config/module.js';
import type { ValidationContext } from './validation/index.js';
import { ValidationMessage } from './validation/index.js';

export function extractModuleConfigs(
    source: ParsedObjectProjectSource,
    options: ModelOptions,
    validationContext: ValidationContext,
): ReadonlyArray<ModuleConfig> {
    if (!source.object || !source.object.modules || !isReadonlyArray(source.object.modules)) {
        return [];
    }

    // only allow module definitions if it's enabled on the project
    // do this validation here because it's the only place where we can report one error per
    // source file instead of complaining about each individual module
    const withModuleDefinitions = options.withModuleDefinitions ?? false;
    if (!withModuleDefinitions) {
        validationContext.addMessage(
            ValidationMessage.error(
                `Module declarations are not supported in this context.`,
                source.pathLocationMap[`/modules`],
            ),
        );
        return [];
    }

    const moduleConfigs = source.object.modules as ReadonlyArray<string>;
    return moduleConfigs.map(
        (name, index): ModuleConfig => ({
            name,
            loc: source.pathLocationMap[`/modules/${index}`],
        }),
    );
}
