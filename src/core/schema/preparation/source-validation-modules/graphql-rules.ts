import type { ASTNode, GraphQLError, Location, ValidationRule } from 'graphql';
import {
    Kind,
    KnownArgumentNamesRule,
    KnownDirectivesRule,
    ProvidedRequiredArgumentsRule,
    UniqueArgumentNamesRule,
    UniqueDirectivesPerLocationRule,
    validate,
    ValuesOfCorrectTypeRule,
    VariablesInAllowedPositionRule,
} from 'graphql';
import { ChangeSet, TextChange } from '../../../model/change-set/change-set.js';
import { ValidationMessage } from '../../../model/validation/message.js';
import { QuickFix } from '../../../model/validation/quick-fix.js';
import { didYouMean, getSimilarNames } from '../../../utils/similar-names.js';
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
            ValidationMessage.error(getMessage(error), getMessageLocation(error), {
                quickFixes: getQuickFixes(error),
            }),
        );
    }
}

function getMessageLocation(error: GraphQLError): Location | undefined {
    if (!error.nodes || !error.nodes.length) {
        return undefined;
    }
    return error.nodes[0].loc;
}

function getMessage(error: GraphQLError): string {
    const node = error.nodes?.[0];
    // graphql-js already includes suggestions for everything except directive names
    if (node && isUnknownDirectiveError(error.message, node)) {
        return (
            error.message +
            didYouMean(getSuggestions(error.message, node).map((name) => '@' + name))
        );
    }
    return error.message;
}

function isUnknownDirectiveError(message: string, node: ASTNode) {
    return node.kind === Kind.DIRECTIVE && message.startsWith('Unknown directive');
}

function getQuickFixes(error: GraphQLError): ReadonlyArray<QuickFix> {
    const node = error.nodes?.[0];
    if (!node) {
        return [];
    }
    const suggestions = getSuggestions(error.message, node);
    // replace the name for unknown arguments, input fields and directives, and the value otherwise
    const loc = 'name' in node && node.name ? node.name.loc : node.loc;
    if (!loc) {
        return [];
    }
    return suggestions.map(
        (suggestion) =>
            new QuickFix({
                kind: 'USE_SIMILAR_NAME',
                description: `Change to "${node.kind === Kind.DIRECTIVE ? '@' : ''}${suggestion}"`,
                // even a single suggestion is only a guess, so it should be reviewed
                isPreferred: false,
                changeSet: new ChangeSet([new TextChange(loc, suggestion)]),
            }),
    );
}

function getSuggestions(message: string, node: ASTNode): ReadonlyArray<string> {
    // graphql-js does not suggest directive names, so we do it ourselves
    if (node.kind === Kind.DIRECTIVE && isUnknownDirectiveError(message, node)) {
        return getSimilarNames(
            node.name.value,
            BASE_SCHEMA.getDirectives().map((directive) => directive.name),
        );
    }
    // e.g. 'Unknown argument "foo" on directive "@bar". Did you mean "a", "b", or "c"?'
    const index = message.indexOf(' Did you mean ');
    if (index < 0) {
        return [];
    }
    return [...message.slice(index).matchAll(/"([^"]*)"/g)].map((match) => match[1]);
}
