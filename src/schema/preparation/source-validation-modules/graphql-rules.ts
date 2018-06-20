import { SourceValidator } from '../ast-validator';
import { ProjectSource, SourceType } from '../../../project/source';
import { ValidationMessage } from '../../../model';
import {
    buildASTSchema, DocumentNode, GraphQLError, KnownArgumentNamesRule, KnownDirectivesRule, KnownTypeNamesRule,
    Location, parse, ProvidedNonNullArgumentsRule, Source, UniqueArgumentNamesRule, UniqueDirectivesPerLocationRule,
    UniqueInputFieldNamesRule, validate, ValuesOfCorrectTypeRule, VariablesInAllowedPositionRule
} from 'graphql';
import { CORE_SCALARS, DIRECTIVES } from '../../graphql-base';
import gql from 'graphql-tag';

// Only include rules that are relevant for schema files
// This is not only for efficiency - specifiedRules also includes ExecutableOperationRule which disallows all type
// definitions, but it is not exported so we can't exclude it.
const rules = [
    KnownTypeNamesRule,
    KnownDirectivesRule,
    UniqueDirectivesPerLocationRule,
    KnownArgumentNamesRule,
    UniqueArgumentNamesRule,
    ValuesOfCorrectTypeRule,
    // note for the future (graphql 0.14): this will be replaced, see https://github.com/graphql/graphql-js/commit/4d2438a26c1027825b201d0f68bd4854c88ece0d
    ProvidedNonNullArgumentsRule,
    VariablesInAllowedPositionRule,
    UniqueInputFieldNamesRule
];

export class GraphQLRulesValidator implements SourceValidator {
    validate(source: ProjectSource): ValidationMessage[] {
        if (source.type != SourceType.GRAPHQLS) {
            return [];
        }

        let ast: DocumentNode;
        try {
            ast = parse(new Source(source.body, source.name));
        } catch (e) {
            // don't report any semantic errors if there are syntax errors
            if (e instanceof GraphQLError) {
                return [];
            }
            throw e;
        }

        return validate(coreSchema, ast, rules).map(error => ValidationMessage.error(error.message, getMessageLocation(error)));
    }
}

function getMessageLocation(error: GraphQLError): Location|undefined {
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
        ...schemaBase.definitions
    ]
});

function getDescriptionFromSyntaxError(error: GraphQLError) {
    const captures = error.message.match(/Syntax Error .* \(\d+:\d+\) (.*)/);
    if (!captures) {
        return error.message;
    }
    return captures[1];
}
