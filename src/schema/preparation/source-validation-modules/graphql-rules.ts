import {
    buildASTSchema,
    DocumentNode,
    GraphQLError,
    Kind,
    KnownArgumentNamesRule,
    KnownDirectivesRule,
    Location,
    ProvidedRequiredArgumentsRule,
    UniqueArgumentNamesRule,
    UniqueDirectivesPerLocationRule,
    validate,
    ValidationRule,
    ValuesOfCorrectTypeRule,
    VariablesInAllowedPositionRule,
} from 'graphql';
import gql from 'graphql-tag';
import {
    ParsedProjectSource,
    ParsedProjectSourceBaseKind,
} from '../../../config/parsed-project.js';
import { ValidationMessage } from '../../../model/index.js';
import { CORE_SCALARS, DIRECTIVES } from '../../graphql-base.js';
import { ParsedSourceValidator } from '../ast-validator.js';

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
