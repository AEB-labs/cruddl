import {
    buildASTSchema,
    DocumentNode,
    GraphQLError,
    KnownDirectivesRule,
    Location,
    UniqueArgumentNamesRule,
    UniqueDirectivesPerLocationRule,
    UniqueEnumValueNamesRule,
    validate,
    ValuesOfCorrectTypeRule,
    VariablesInAllowedPositionRule,
} from 'graphql';
import gql from 'graphql-tag';
import { KnownArgumentNamesOnDirectivesRule } from 'graphql/validation/rules/KnownArgumentNamesRule';
import { ProvidedRequiredArgumentsOnDirectivesRule } from 'graphql/validation/rules/ProvidedRequiredArgumentsRule';
import { ParsedProjectSource, ParsedProjectSourceBaseKind } from '../../../config/parsed-project';
import { ValidationMessage } from '../../../model';
import { CORE_SCALARS, DIRECTIVES } from '../../graphql-base';
import { ParsedSourceValidator } from '../ast-validator';

// Only include rules that are relevant for schema files
// there is a non-public export specifiedSDLRules, but we only include those relevant for us. Some rules apply to
// stuff we don't support like extensions, and for other rules, we have our own validators (e.g. name collision is done
// in the model and extended with collisions with system fields)
const rules = [
    KnownDirectivesRule,
    UniqueDirectivesPerLocationRule,
    KnownArgumentNamesOnDirectivesRule,
    UniqueArgumentNamesRule,
    UniqueEnumValueNamesRule,
    ValuesOfCorrectTypeRule,
    ProvidedRequiredArgumentsOnDirectivesRule,
    VariablesInAllowedPositionRule,
];

export class GraphQLRulesValidator implements ParsedSourceValidator {
    validate(source: ParsedProjectSource): ValidationMessage[] {
        if (source.kind != ParsedProjectSourceBaseKind.GRAPHQL) {
            return [];
        }

        let ast = source.document;

        return validate(coreSchema, ast, rules).map((error) =>
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
    kind: 'Document',
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
