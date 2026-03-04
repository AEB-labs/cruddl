import type { ProjectOptions } from '../../config/interfaces.js';
import { ValidationContext } from '../../model/index.js';
import { ProjectSource, SourceType } from '../../project/source.js';
import { parseGraphQLSource } from './parse-graphql-source.js';
import { parseJSONSource } from './parse-json-source.js';
import { parseYAMLSource } from './parse-yaml-source.js';
import type { ParsedProjectSource } from './parsed-project.js';

export function parseProjectSource(
    projectSource: ProjectSource,
    options: ProjectOptions,
    validationContext: ValidationContext,
): ParsedProjectSource | undefined {
    switch (projectSource.type) {
        case SourceType.YAML:
            return parseYAMLSource(projectSource, options, validationContext);
        case SourceType.JSON:
            return parseJSONSource(projectSource, options, validationContext);
        case SourceType.GRAPHQLS:
            return parseGraphQLSource(projectSource, options, validationContext);
        default:
            throw new Error(`Unexpected project source type: ${projectSource.type}`);
    }
}
