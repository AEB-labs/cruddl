import type { RootEntityType } from '../implementation/root-entity-type.js';
import { ValidationMessage } from '../validation/message.js';
import type { ValidationContext } from '../validation/validation-context.js';

export function checkTtl(
    typeToCheck: RootEntityType,
    baselineType: RootEntityType,
    context: ValidationContext,
) {
    if (baselineType.timeToLiveTypes.length && !typeToCheck.timeToLiveTypes.length) {
        context.addMessage(
            ValidationMessage.suppressableCompatibilityIssue(
                'TTL',
                `There should be a timeToLive configuration for type "${baselineType.name}".`,
                typeToCheck.astNode,
                { location: typeToCheck.nameASTNode },
            ),
        );
    }
    if (!baselineType.timeToLiveTypes.length && typeToCheck.timeToLiveTypes.length) {
        // The @suppress needs to be specified on the root entity definition (because there is no @suppress for yaml/json files)
        // For this reason, we report the error on the type and not on the TTL config
        context.addMessage(
            ValidationMessage.suppressableCompatibilityIssue(
                'TTL',
                `There does not need to be a timeToLive configuration for type "${baselineType.name}". If the timeToLive configuration is intentional, suppress this message.`,
                typeToCheck.astNode,
                { location: typeToCheck.nameASTNode },
            ),
        );
    }
}
