import { SourceValidator } from '../ast-validator';
import { ProjectSource, SourceType } from '../../../project/source';
import { ValidationMessage } from '../validation-message';
import { buildASTSchema, DocumentNode, GraphQLError, Location, parse, Source, specifiedRules, validate } from 'graphql';
import { CORE_SCALARS, DIRECTIVES } from '../../graphql-base';
import gql from 'graphql-tag';

// ExecutableDefinitions does not allow the SDL definitions
const rules = specifiedRules.filter(rule => rule.name != 'ExecutableDefinitions');

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

        return validate(coreSchema, ast, rules).map(error => ValidationMessage.error(
            error.message,
            {},
            getMessageLocation(error)
        ));
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
