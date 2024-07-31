import {
    buildASTSchema,
    DocumentNode,
    GraphQLError,
    Kind,
    KnownDirectivesRule,
    Location,
    UniqueArgumentNamesRule,
    UniqueDirectivesPerLocationRule,
    UniqueEnumValueNamesRule,
    validate,
    ValidationRule,
    ValuesOfCorrectTypeRule,
    VariablesInAllowedPositionRule,
} from 'graphql';
import gql from 'graphql-tag';
import { KnownArgumentNamesOnDirectivesRule } from 'graphql/validation/rules/KnownArgumentNamesRule';
import { ProvidedRequiredArgumentsOnDirectivesRule } from 'graphql/validation/rules/ProvidedRequiredArgumentsRule';
import { validateSDL } from 'graphql/validation/validate';
import { SDLValidationRule } from 'graphql/validation/ValidationContext';
import { ParsedProjectSource, ParsedProjectSourceBaseKind } from '../../../config/parsed-project';
import { ValidationMessage } from '../../../model';
import { CORE_SCALARS, DIRECTIVES } from '../../graphql-base';
import { ParsedSourceValidator } from '../ast-validator';

// Only include rules that are relevant for schema files
// there is a non-public export specifiedSDLRules, but we only include those relevant for us. Some rules apply to
// stuff we don't support like extensions, and for other rules, we have our own validators (e.g. name collision is done
// in the model and extended with collisions with system fields)
const rules: ReadonlyArray<ValidationRule> = [
    KnownDirectivesRule,
    UniqueDirectivesPerLocationRule,
    KnownArgumentNamesOnDirectivesRule,
    UniqueArgumentNamesRule,
    ValuesOfCorrectTypeRule,
    ProvidedRequiredArgumentsOnDirectivesRule,
    VariablesInAllowedPositionRule,
];

const sdlRules: ReadonlyArray<SDLValidationRule> = [UniqueEnumValueNamesRule];

export class GraphQLRulesValidator implements ParsedSourceValidator {
    validate(source: ParsedProjectSource): ReadonlyArray<ValidationMessage> {
        if (source.kind != ParsedProjectSourceBaseKind.GRAPHQL) {
            return [];
        }

        let ast = source.document;

        const results = [
            ...validate(coreSchema, ast, rules),
            // TODO validateSDL is internal. Do we need the SDL rule?
            ...validateSDL(ast, undefined, sdlRules),
        ];

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
