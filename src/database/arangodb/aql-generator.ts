import {
    BasicType, BinaryOperationQueryNode, BinaryOperator, ConcatListsQueryNode, ConditionalQueryNode,
    ConstBoolQueryNode,
    ContextAssignmentQueryNode, ContextQueryNode, CreateEntityQueryNode, EntitiesQueryNode, FieldQueryNode,
    FirstOfListQueryNode, ListQueryNode, LiteralQueryNode, ObjectQueryNode, OrderDirection, OrderSpecification,
    QueryNode, TransformListQueryNode, TypeCheckQueryNode, UnaryOperationQueryNode, UnaryOperator,
    UpdateEntitiesQueryNode, UpdateObjectQueryNode
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

    export function parenthesizeList(...content: AQLFragment[]): AQLFragment {
        return aql.lines(
            aql`(`,
            aql.indent(aql.lines(...content)),
            aql`)`
        );
    }

    export function parenthesizeObject(...content: AQLFragment[]): AQLFragment {
        return aql`FIRST${parenthesizeList(...content)}`;
    }
}

const processors : { [name: string]: NodeProcessor<any> } = {
    Literal(node: LiteralQueryNode): AQLFragment {
        return aql`${node.value}`;
    },

    Null(): AQLFragment {
        return aql`null`;
    },

    ConstBool(node: ConstBoolQueryNode): AQLFragment {
        return node.value ? aql`true` : aql`false`;
    },

    Object(node: ObjectQueryNode, context): AQLFragment {
        if (!node.properties.length) {
            return aql`{}`;
        }

        const properties = node.properties.map(p =>
            aql`${aqlExt.safeJSONKey(p.propertyName)}: ${processNode(p.valueNode, context)}`);
        return aql.lines(
            aql`{`,
            aql.indent(aql.join(properties, aql`,\n`)),
            aql`}`
        );
    },

    List(node: ListQueryNode, context): AQLFragment {
        const test = aql`"${aql.string('"test')}`;
        if (!node.itemNodes.length) {
            return aql`[]`;
        }

        return aql.lines(
            aql`[`,
            aql.indent(aql.join(node.itemNodes.map(itemNode => processNode(itemNode, context)), aql`,\n`)),
            aql`]`
        );
    },

    ConcatLists(node: ConcatListsQueryNode, context): AQLFragment {
        const listNodes = node.listNodes.map(node => processNode(node, context));
        const listNodeStr = aql.join(listNodes, aql`, `);
        // note: UNION just appends, there is a special UNION_DISTINCT to filter out duplicates
        return aql`UNION(${listNodeStr})`;
    },

    Context(node: ContextQueryNode, context): AQLFragment {
        return context || aql`null`;
    },

    ContextAssignment(node: ContextAssignmentQueryNode, context): AQLFragment {
        const tmpVar = aql.variable();
        // note that we have to know statically if the context var is a list or an object
        // assuming object here because lists are not needed currently
        return aqlExt.parenthesizeObject(
            aql`LET ${tmpVar} = ${processNode(node.contextValueNode, context)}`,
            aql`RETURN ${processNode(node.resultNode, tmpVar)}`
        );
    },

    Field(node: FieldQueryNode, context): AQLFragment {
        const object = processNode(node.objectNode, context);
        let identifier = node.field.name;
        if (identifier == 'id') {
            identifier = '_key'; // ids are stored in _key field
        }

        if (aql.isSafeIdentifier(identifier)) {
            return aql`${object}.${aql.identifier(identifier)}`;
        }
        // fall back to bound values. do not attempt aql.string for security reasons - should not be the case normally, anyway.
        return aql`${object}[${identifier}]`;
    },

    TransformList(node: TransformListQueryNode, context): AQLFragment {
        const list = processNode(node.listNode, context);
        const itemVar = aql.variable();
        return aqlExt.parenthesizeList(
            aql`FOR ${itemVar}`,
            aql`IN ${list}`,
            aql`FILTER ${processNode(node.filterNode, itemVar)}`,
            generateSortAQL(node.orderBy, itemVar),
            node.maxCount != undefined ? aql`LIMIT ${node.maxCount}` : aql``,
            aql`RETURN ${processNode(node.innerNode, itemVar)}`
        );
    },

    UpdateObject(node: UpdateObjectQueryNode, context): AQLFragment {
        return aql`MERGE(${processNode(node.sourceNode, context)}, ${processNode(new ObjectQueryNode(node.updates), context)})`;
    },

    FirstOfList(node: FirstOfListQueryNode, context): AQLFragment {
        return aql`FIRST(${processNode(node.listNode, context)})`;
    },

    BinaryOperation(node: BinaryOperationQueryNode, context): AQLFragment {
        const lhs = processNode(node.lhs, context);
        const rhs = processNode(node.rhs, context);
        const op = getAQLOperator(node.operator);
        if (op) {
            return aql`(${lhs} ${op} ${rhs})`;
        }

        // TODO maybe use LIKE for fulltext indices
        switch (node.operator) {
            case BinaryOperator.CONTAINS:
                return aql`CONTAINS(${lhs}, ${rhs})`;
            case BinaryOperator.STARTS_WITH:
                return aql`(LEFT(${lhs}, LENGTH(${rhs})) == ${rhs})`;
            case BinaryOperator.ENDS_WITH:
                return aql`(RIGHT(${lhs}, LENGTH(${rhs})) == ${rhs})`;
            default:
                throw new Error(`Unsupported binary operator: ${op}`);
        }
    },

    UnaryOperation(node: UnaryOperationQueryNode, context) {
        switch (node.operator) {
            case UnaryOperator.NOT:
                return aql`!(${processNode(node.valueNode, context)})`;
            case UnaryOperator.JSON_STRINGIFY:
                return aql`JSON_STRINGIFY(${processNode(node.valueNode, context)})`
            default:
                throw new Error(`Unsupported unary operator: ${node.operator}`);
        }
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
    },

    Entities(node: EntitiesQueryNode): AQLFragment {
        return getCollectionForType(node.objectType);
    },

    CreateEntity(node: CreateEntityQueryNode, context): AQLFragment {
        return aqlExt.parenthesizeObject(
            aql`INSERT ${processNode(node.objectNode, context)} IN ${getCollectionForType(node.objectType)}`,
            aql`RETURN NEW`
        );
    },

    UpdateEntities(node: UpdateEntitiesQueryNode) {
        const entityVar = aql.variable();
        return aqlExt.parenthesizeList(
            aql`FOR ${entityVar}`,
            aql`IN ${getCollectionForType(node.objectType)}`,
            aql`FILTER ${processNode(node.filterNode, entityVar)}`,
            node.maxCount !== undefined ? aql`LIMIT ${node.maxCount}` : aql``,
            aql`UPDATE ${entityVar}`,
            aql`WITH ${processNode(new ObjectQueryNode(node.updates), entityVar)}`,
            aql`IN ${getCollectionForType(node.objectType)}`,
            aql`OPTIONS { mergeObjects: false }`,
            aql`RETURN NEW`
        );
    }
};

function getAQLOperator(op: BinaryOperator): AQLFragment|undefined {
    switch (op) {
        case BinaryOperator.AND:
            return aql`&&`;
        case BinaryOperator.OR:
            return aql`||`;
        case BinaryOperator.EQUAL:
            return aql`==`;
        case BinaryOperator.UNEQUAL:
            return aql`!=`;
        case BinaryOperator.LESS_THAN:
            return aql`<`;
        case BinaryOperator.LESS_THAN_OR_EQUAL:
            return aql`<=`;
        case BinaryOperator.GREATER_THAN:
            return aql`>`;
        case BinaryOperator.GREATER_THAN_OR_EQUAL:
            return aql`>=`;
        case BinaryOperator.IN:
            return aql`IN`;
        default:
            return undefined;
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
