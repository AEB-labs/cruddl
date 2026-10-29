import type { ASTNode, DocumentNode, GraphQLError, Location, ValidationRule } from 'graphql';
import {
    buildASTSchema,
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
import { gql } from 'graphql-tag';
import { ChangeSet, TextChange } from '../../../model/change-set/change-set.js';
import { ValidationMessage } from '../../../model/validation/message.js';
import { QuickFix } from '../../../model/validation/quick-fix.js';
import { getSimilarNames } from '../../../utils/similar-names.js';
import { CORE_SCALARS, DIRECTIVES } from '../../graphql-base.js';
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

        const results = [...validate(coreSchema, ast, rules)];

        return results.map((error) =>
            ValidationMessage.error(error.message, getMessageLocation(error), {
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
                description: `Change to "${node.kind === Kind.DIRECTIVE ? '@' : ''}${suggestion}"`,
                isPreferred: suggestions.length === 1,
                changeSet: new ChangeSet([new TextChange(loc, suggestion)]),
            }),
    );
}

function getSuggestions(message: string, node: ASTNode): ReadonlyArray<string> {
    // graphql-js does not suggest directive names, so we do it ourselves
    if (node.kind === Kind.DIRECTIVE && message.startsWith('Unknown directive')) {
        return getSimilarNames(
            node.name.value,
            coreSchema.getDirectives().map((directive) => directive.name),
        );
    }
    // e.g. 'Unknown argument "foo" on directive "@bar". Did you mean "a", "b", or "c"?'
    const index = message.indexOf(' Did you mean ');
    if (index < 0) {
        return [];
    }
    return [...message.slice(index).matchAll(/"([^"]*)"/g)].map((match) => match[1]);
}

const schemaBase: DocumentNode = gql`
    schema {
        query: DummyQueryType___
    }

    type DummyQueryType___ {
        field: ID
    }
`;

const coreSchema = buildASTSchema({
    kind: Kind.DOCUMENT,
    definitions: [
        ...DIRECTIVES.definitions,
        ...CORE_SCALARS.definitions,
        ...schemaBase.definitions,
    ],
});

function getDescriptionFromSyntaxError(error: GraphQLError) {
    const captures = error.message.match(/Syntax Error .* \(\d+:\d+\) (.*)/);
    if (!captures) {
        return error.message;
    }
    return captures[1];
}
