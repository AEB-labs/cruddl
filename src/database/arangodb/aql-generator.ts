import {
    BasicType, BinaryOperationQueryNode, BinaryOperator, ConditionalQueryNode, ContextQueryNode, EntitiesQueryNode,
    FieldQueryNode, ListQueryNode, LiteralQueryNode, ObjectQueryNode, OrderDirection, OrderSpecification, QueryNode,
    TypeCheckQueryNode
} from '../../query/definition';
import { aql, AQLFragment } from './aql';
import { GraphQLNamedType } from 'graphql';
import * as pluralize from 'pluralize';
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

    Literal(node: LiteralQueryNode): AQLFragment {
        return aql`${node.value}`;
    },

    Field(node: FieldQueryNode, context): AQLFragment {
        const object = processNode(node.objectNode, context);
        const id = node.field.name;
        if (aql.isSafeIdentifier(id)) {
            return aql`${object}.${aql.identifier(id)}`;
        }
        // fall back to bound values. do not attempt aql.string for security reasons - should not be the case normally, anyway.
        return aql`${object}[${id}]`;
    },

    Entities(node: EntitiesQueryNode): AQLFragment {
        const entityVar = aql.variable();
        const coll = getCollectionForType(node.objectType);
        return aql.lines(
            aql`(`,
            aql.indent(aql.lines(
                aql`FOR ${entityVar}`,
                aql`IN ${coll}`,
                aql`FILTER ${processNode(node.filterNode, entityVar)}`,
                generateSortAQL(node.orderBy, entityVar),
                aql`RETURN ${processNode(node.innerNode, entityVar)}`)
            ),
            aql`)`);
    },

    List(node: ListQueryNode, context): AQLFragment {
        const list = processNode(node.listNode, context);
        const itemVar = aql.variable();
        return aql.lines(
            aql`(`,
            aql.indent(aql.lines(
                aql`FOR ${itemVar}`,
                aql`IN ${list}`,
                aql`FILTER ${processNode(node.filterNode, itemVar)}`,
                generateSortAQL(node.orderBy, context),
                node.maxCount != undefined ? aql`LIMIT ${node.maxCount}` : aql``,
                aql`RETURN ${processNode(node.innerNode, itemVar)}`)
            ),
            aql`)`);
    },

    BinaryOperation(node: BinaryOperationQueryNode, context): AQLFragment {
        const op = getAQLOperator(node.operator);
        const lhs = processNode(node.lhs, context);
        const rhs = processNode(node.rhs, context);
        return aql`${lhs} ${op} ${rhs}`;
    },

    Conditional(node: ConditionalQueryNode, context) {
        const cond = processNode(node.condition, context);
        const expr1 = processNode(node.expr1, context);
        const expr2 = processNode(node.expr2, context);
        return aql`(${cond} ? ${expr1} : ${expr2})`;
    },

    TypeCheck(node: TypeCheckQueryNode, context) {
        const value = processNode(node.valueNode, context);

        switch (node.type) {
            case BasicType.SCALAR:
                return aql`(IS_BOOL(${value}) || IS_NUMBER(${value}) || IS_STRING(${value}))`;
            case BasicType.LIST:
                return aql`IS_LIST(${value})`;
            case BasicType.OBJECT:
                return aql`IS_OBJECT(${value})`;
            case BasicType.NULL:
                return aql`IS_NULL(${value})`;
        }
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

function generateSortAQL(orderBy: OrderSpecification, context?: AQLFragment): AQLFragment {
    if (orderBy.isUnordered()) {
        return aql``;
    }

    function dirAQL(dir: OrderDirection) {
        if (dir == OrderDirection.DESCENDING) {
            return aql` DESC`;
        }
        return aql``;
    }

    const clauses = orderBy.clauses.map(cl => aql`(${processNode(cl.valueNode, context)}) ${dirAQL(cl.direction)}`);

    return aql`SORT ${aql.join(clauses, aql`, `)}`;
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
    return aql`RETURN ${processNode(node)}`;
}

function getCollectionForType(type: GraphQLNamedType) {
    return aql.collection(decapitalize(pluralize(type.name)));
}
