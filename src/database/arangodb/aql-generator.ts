import {
    EntitiesQueryNode, FieldQueryNode, LiteralQueryNode, ObjectQueryNode, QueryNode
} from '../../query/definition';
import { aql, AQLFragment } from './aql';
import { GraphQLNamedType } from 'graphql';
import * as pluralize from "pluralize";
import { decapitalize } from '../../utils/utils';

type NodeProcessor<T extends QueryNode> = (node: T, context?: AQLFragment) => AQLFragment;

const processors: { [name: string]: NodeProcessor<any> } = {
    Object(node: ObjectQueryNode, context) {
        const properties = node.properties.map(p => aql`${aql.string(p.propertyName)}: ${processNode(p.valueNode, context)}`);
        return aql.lines(
            aql`{`,
            aql.indent(aql.join(properties, aql`,\n`)),
            aql`}`
        );
    },

    Literal(node: LiteralQueryNode, context) {
        return aql`${node.value}`;
    },

    Field(node: FieldQueryNode, context) {
        return aql`${context}[${node.field.name}]`;
    },

    Entities(node: EntitiesQueryNode, context) {
        const entityVar = aql.variable();
        const coll = getCollectionForType(node.type);
        return aql.lines(
            aql`(`,
            aql.indent(aql.lines(
                aql`FOR ${entityVar}`,
                aql`IN ${coll}`,
                aql`RETURN ${processNode(node.innerNode, entityVar)}`)
            ),
            aql`)`);
    }
};

function processNode(node: QueryNode, context?: AQLFragment) {
    const type = node.constructor.name;
    const rawType = type.replace(/QueryNode$/, '');
    if (!(rawType in processors)) {
        throw new Error(`Unsupported query type: ${type}`);
    }
    return processors[rawType](node, context);
}

export function getAQLForQuery(node: QueryNode) {
    return processNode(node);
}

function getCollectionForType(type: GraphQLNamedType) {
    return aql.collection(decapitalize(pluralize(type.name)));
}