import { ValidationContext } from '../../model/index.js';
import { Project } from '../../project/project.js';
import { isDefined } from '../../utils/utils.js';
import { parseProjectSource } from './parse-project-source.js';
import type { ParsedProject } from './parsed-project.js';

/**
 * Parse all schema parts sources which aren't AST already and deep clone all AST sources.
 */
export function parseProject(
    project: Project,
    validationContext: ValidationContext,
): ParsedProject {
    return {
        sources: project.sources
            .map((source) => parseProjectSource(source, project.options, validationContext))
            .filter(isDefined),
    };
}
