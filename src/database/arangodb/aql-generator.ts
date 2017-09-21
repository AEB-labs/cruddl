import {
    BinaryOperationQueryNode, BinaryOperator, ContextQueryNode,
    EntitiesQueryNode, FieldQueryNode, LiteralQueryNode, ObjectQueryNode, QueryNode
} from '../../query/definition';
import { aql, AQLFragment } from './aql';
import { GraphQLNamedType } from 'graphql';
import * as pluralize from "pluralize";
import { decapitalize } from '../../utils/utils';

type NodeProcessor<T extends QueryNode> = (node: T, context?: AQLFragment) => AQLFragment;

namespace aqlExt {
    export function safeJSONKey(key: string): AQLFragment {
        if (aql.isSafeIdentifier(key)) {
            return aql`${aql.string(key)}`; // if safe, use "name" approach
        } else {
            return aql`${key}`; // fall back to bound values
        }
    }
}

const processors: { [name: string]: NodeProcessor<any> } = {
    Object(node: ObjectQueryNode, context): AQLFragment {
        const properties = node.properties.map(p =>
            aql`${aqlExt.safeJSONKey(p.propertyName)}: ${processNode(p.valueNode, context)}`);
        return aql.lines(
            aql`{`,
            aql.indent(aql.join(properties, aql`,\n`)),
            aql`}`
        );
    },

    Context(node: ContextQueryNode, context): AQLFragment {
        return context || aql`null`;
    },

    Literal(node: LiteralQueryNode, context): AQLFragment {
        return aql`${node.value}`;
    },

    Field(node: FieldQueryNode, context): AQLFragment {
        const id = node.field.name;
        if (aql.isSafeIdentifier(id)) {
            return aql`${context}.${aql.identifier(id)}`;
        }
        // fall back to bound values. do not attempt aql.string for security reasons - should not be the case normally, anyway.
        return aql`${context}[${id}]`;
    },

    Entities(node: EntitiesQueryNode, context): AQLFragment {
        const entityVar = aql.variable();
        const coll = getCollectionForType(node.objectType);
        return aql.lines(
            aql`(`,
            aql.indent(aql.lines(
                aql`FOR ${entityVar}`,
                aql`IN ${coll}`,
                aql`FILTER ${processNode(node.filterNode, entityVar)}`,
                aql`RETURN ${processNode(node.innerNode, entityVar)}`)
            ),
            aql`)`);
    },

    BinaryOperation(node: BinaryOperationQueryNode, context): AQLFragment {
        const op = getAQLOperator(node.operator);
        const lhs = processNode(node.lhs, context);
        const rhs = processNode(node.rhs, context);
        return aql`${lhs} ${op} ${rhs}`;
    }
};

function getAQLOperator(op: BinaryOperator): AQLFragment {
    switch (op) {
        case BinaryOperator.AND:
            return aql`'&&`;
        case BinaryOperator.OR:
            return aql`'||`;
        case BinaryOperator.EQUALS:
            return aql`==`;
        default:
            throw new Error(`Unsupported binary operator: ${op}`);
    }
}

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
