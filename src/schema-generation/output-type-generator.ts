import { GraphQLID, GraphQLNonNull, GraphQLString } from 'graphql';
import { sortBy } from 'lodash';
import memorize from 'memorize-decorator';
import { FieldRequest } from '../graphql/query-distiller';
import { isListTypeIgnoringNonNull } from '../graphql/schema-utils';
import { Field, ObjectType, RootEntityType, Type, TypeKind } from '../model';
import {
    NullQueryNode,
    ObjectQueryNode,
    PropertySpecification,
    QueryNode,
    RevisionQueryNode,
    UnaryOperationQueryNode,
    UnaryOperator
} from '../query-tree';
import { CURSOR_FIELD, FLEX_SEARCH_ENTITIES_FIELD_PREFIX, ORDER_BY_ARG, REVISION_FIELD } from '../schema/constants';
import { getMetaFieldName } from '../schema/names';
import { compact, flatMap } from '../utils/utils';
import { EnumTypeGenerator } from './enum-type-generator';
import { createFieldNode } from './field-nodes';
import { FilterAugmentation } from './filter-augmentation';
import { ListAugmentation } from './list-augmentation';
import { MetaTypeGenerator } from './meta-type-generator';
import { OrderByEnumGenerator, OrderByEnumType, OrderByEnumValue } from './order-by-enum-generator';
import { QueryNodeField, QueryNodeListType, QueryNodeNonNullType, QueryNodeOutputType } from './query-node-object-type';
import { orderArgMatchesPrimarySort } from './utils/flex-search-utils';
import { getOrderByValues } from './utils/pagination';

export class OutputTypeGenerator {
    constructor(
        private readonly listAugmentation: ListAugmentation,
        private readonly filterAugmentation: FilterAugmentation,
        private readonly enumTypeGenerator: EnumTypeGenerator,
        private readonly orderByEnumGenerator: OrderByEnumGenerator,
        private readonly metaTypeGenerator: MetaTypeGenerator
    ) {}

    generate(type: Type): QueryNodeOutputType {
        if (type.isObjectType) {
            return this.generateObjectType(type);
        }
        if (type.isScalarType) {
            return type.graphQLScalarType;
        }
        if (type.isEnumType) {
            return this.enumTypeGenerator.generate(type);
        }
        throw new Error(`Unsupported type kind: ${(type as Type).kind}`);
    }

    @memorize()
    private generateObjectType(objectType: ObjectType): QueryNodeOutputType {
        const descriptionParts = [];
        if (objectType.description) {
            descriptionParts.push(objectType.description);
        }
        if (objectType.isRootEntityType && objectType.isBusinessObject) {
            descriptionParts.push('This type is a business object.');
        }
        const description = descriptionParts.length ? descriptionParts.join('\n\n') : undefined;

        return {
            name: objectType.name,
            description,
            fields: () => this.getFields(objectType)
        };
    }

    private getFields(objectType: ObjectType): ReadonlyArray<QueryNodeField> {
        const origFields = [...objectType.fields];
        origFields.filter(field => field.isReference);

        const fields = flatMap(objectType.fields, field => {
            const nodeFields = this.createFields(field);
            if (field.isReference) {
                const type = field.type;
                if (type.kind === TypeKind.ROOT_ENTITY) {
                    nodeFields.forEach(nf => {
                        nf.description =
                            (field.description ? field.description + '\n\n' : '') +
                            'This field references a `' +
                            type.name +
                            '` by its `' +
                            (type.keyField ? type.keyField.name : 'key') +
                            '` field';
                    });
                }
            }
            return nodeFields;
        });

        return [
            ...fields,
            ...compact([
                // include cursor fields in all types that could occur in lists and that can be ordered (unorderable types can't use cursor-based navigation)
                this.createCursorField(objectType),

                this.createRevisionField(objectType)
            ])
        ];
    }

    private createCursorField(objectType: ObjectType): QueryNodeField | undefined {
        if (objectType.isEntityExtensionType) {
            return undefined;
        }
        const orderByType = this.orderByEnumGenerator.generate(objectType);
        if (!orderByType) {
            return undefined;
        }
        return {
            name: CURSOR_FIELD,
            type: GraphQLString,
            isPure: true,
            description: `Provides a value that can be supplied to the \`after\` argument for pagination. Depends on the value of the \`orderBy\` argument.`,
            resolve: (source, args, info) =>
                this.getCursorNode(
                    source,
                    info.selectionStack[info.selectionStack.length - 2].fieldRequest,
                    orderByType,
                    objectType
                )
        };
    }

    private getCursorNode(
        itemNode: QueryNode,
        listFieldRequest: FieldRequest | undefined,
        orderByType: OrderByEnumType,
        objectType: ObjectType
    ): QueryNode {
        if (!listFieldRequest || !isListTypeIgnoringNonNull(listFieldRequest.field.type)) {
            return NullQueryNode.NULL;
        }

        // force the absolute-order-behavior we normally only have if the 'first' argument is present
        // so one can use a _cursor value from a query without orderBy as 'after' argument without orderBy.
        // however, if this is the cursor within a flexsearch request and we can use the primary sort, do it
        let orderByValues: ReadonlyArray<OrderByEnumValue>;
        if (
            objectType.isRootEntityType &&
            listFieldRequest.fieldName.startsWith(FLEX_SEARCH_ENTITIES_FIELD_PREFIX) &&
            orderArgMatchesPrimarySort(listFieldRequest.args[ORDER_BY_ARG], objectType.flexSearchPrimarySort)
        ) {
            // this would be cleaner if the primary sort was actually parsed into a ModelComponent (see e.g. the Index and IndexField classes)
            orderByValues = objectType.flexSearchPrimarySort.map(clause =>
                orderByType.getValueOrThrow(clause.field.replace('.', '_') + (clause.asc ? '_ASC' : '_DESC'))
            );
        } else {
            orderByValues = getOrderByValues(listFieldRequest.args, orderByType, { isAbsoluteOrderRequired: true });
        }
        const sortedClauses = sortBy(orderByValues, clause => clause.name);
        const objectNode = new ObjectQueryNode(
            sortedClauses.map(
                clause => new PropertySpecification(clause.underscoreSeparatedPath, clause.getValueNode(itemNode))
            )
        );
        return new UnaryOperationQueryNode(objectNode, UnaryOperator.JSON_STRINGIFY);
    }

    private createRevisionField(objectType: ObjectType): QueryNodeField | undefined {
        if (!objectType.isRootEntityType) {
            return undefined;
        }

        return {
            name: REVISION_FIELD,
            description: `An identifier that is updated automatically on each update of this root entity (but not on relation changes)`,
            type: GraphQLNonNull(GraphQLID),
            resolve: source => this.getRevisionNode(source)
        };
    }

    private getRevisionNode(itemNode: QueryNode): QueryNode {
        return new RevisionQueryNode(itemNode);
    }

    private createFields(field: Field): ReadonlyArray<QueryNodeField> {
        const type = this.generate(field.type);
        const itemType = field.isNonNull ? new QueryNodeNonNullType(type) : type;
        const schemaField: QueryNodeField = {
            name: field.name,
            type: field.isList ? new QueryNodeNonNullType(new QueryNodeListType(itemType)) : itemType,
            description: field.description,
            deprecationReason: field.deprecationReason,

            // normally, entity extensions are converted to an empty object if null, and normally query field nodes have
            // a check that they return null if the source node is null.
            // if we skip both, entity extensions will be passed as null, but they will only ever be used to look up
            // fields in them, and a FieldQueryNode returns null if the source is null.
            skipNullCheck: field.type.isEntityExtensionType,
            isPure: true,
            resolve: sourceNode => createFieldNode(field, sourceNode, { skipNullFallbackForEntityExtensions: true })
        };

        if (field.isList && field.type.isObjectType) {
            return [this.listAugmentation.augment(schemaField, field.type), this.createMetaField(field)];
        } else {
            return [schemaField];
        }
    }

    private createMetaField(field: Field): QueryNodeField {
        if (!field.type.isObjectType) {
            throw new Error(`Can only create meta field for object types`);
        }

        const metaType = this.metaTypeGenerator.generate();
        const plainField: QueryNodeField = {
            name: getMetaFieldName(field.name),
            type: new QueryNodeNonNullType(metaType),
            skipNullCheck: true, // meta fields should never be null
            description: field.description,
            isPure: true,
            resolve: sourceNode => createFieldNode(field, sourceNode)
        };
        return this.filterAugmentation.augment(plainField, field.type);
    }
}
