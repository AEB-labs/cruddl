import { ModelOptions } from '../config/interfaces';
import { ParsedObjectProjectSource } from '../config/parsed-project';
import { ModuleConfig } from './config/module';
import { ValidationContext, ValidationMessage } from './validation';

export function parseModuleConfigs(
    source: ParsedObjectProjectSource,
    options: ModelOptions,
    validationContext: ValidationContext,
): ReadonlyArray<ModuleConfig> {
    if (!source.object || !source.object.modules || !Array.isArray(source.object.modules)) {
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
