import type { GraphQLError, Location, ValidationRule } from 'graphql';
import {
    KnownArgumentNamesRule,
    KnownDirectivesRule,
    ProvidedRequiredArgumentsRule,
    UniqueArgumentNamesRule,
    UniqueDirectivesPerLocationRule,
    validate,
    ValuesOfCorrectTypeRule,
    VariablesInAllowedPositionRule,
} from 'graphql';
import { ValidationMessage } from '../../../model/validation/message.js';
import { BASE_SCHEMA } from '../../graphql-base.js';
import type { ParsedProjectSource } from '../../parsing/parsed-project.js';
import { ParsedProjectSourceBaseKind } from '../../parsing/parsed-project.js';
import type { ParsedSourceValidator } from '../ast-validator.js';

// Only include rules that are relevant for schema files
// there is a non-public export specifiedSDLRules, but we only include those relevant for us. Some rules apply to
// stuff we don't support like extensions, and for other rules, we have our own validators (e.g. name collision is done
// in the model and extended with collisions with system fields)
const rules: ReadonlyArray<ValidationRule> = [
    KnownDirectivesRule,
    UniqueDirectivesPerLocationRule,
    KnownArgumentNamesRule, // KnownArgumentNamesRule would be more accurate but it's internal
    UniqueArgumentNamesRule,
    ValuesOfCorrectTypeRule,
    ProvidedRequiredArgumentsRule, // ProvidedRequiredArgumentsOnDirectivesRule would be more accurate but it's internal
    VariablesInAllowedPositionRule,
];

export class GraphQLRulesValidator implements ParsedSourceValidator {
    validate(source: ParsedProjectSource): ReadonlyArray<ValidationMessage> {
        if (source.kind != ParsedProjectSourceBaseKind.GRAPHQL) {
            return [];
        }

        let ast = source.document;

        const results = [...validate(BASE_SCHEMA, ast, rules)];

        return results.map((error) =>
            ValidationMessage.error(error.message, getMessageLocation(error)),
        );
    }
}

function getMessageLocation(error: GraphQLError): Location | undefined {
    if (!error.nodes || !error.nodes.length) {
        return undefined;
    }
    return error.nodes[0].loc;
}
