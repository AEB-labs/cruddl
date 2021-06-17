import { GraphQLID, GraphQLNonNull, GraphQLString } from 'graphql';
import { sortBy } from 'lodash';
import memorize from 'memorize-decorator';
import { FieldRequest, FieldSelection } from '../graphql/query-distiller';
import { isListTypeIgnoringNonNull } from '../graphql/schema-utils';
import { CollectPath, Field, ObjectType, Type, TypeKind } from '../model';
import {
    NOT_SUPPORTED_ERROR,
    NullQueryNode,
    ObjectQueryNode,
    OrderDirection,
    PropertyAccessQueryNode,
    PropertySpecification,
    QueryNode,
    RevisionQueryNode,
    RuntimeErrorQueryNode,
    UnaryOperationQueryNode,
    UnaryOperator
} from '../query-tree';
import { CURSOR_FIELD, FLEX_SEARCH_ENTITIES_FIELD_PREFIX, ORDER_BY_ARG, REVISION_FIELD } from '../schema/constants';
import { getMetaFieldName } from '../schema/names';
import { compact, flatMap } from '../utils/utils';
import {
    getFieldAtSelection,
    getHierarchyStackFrame,
    HierarchyStackFrame,
    setFieldAtSelection,
    setHierarchyStackFrame
} from './entity-hierarchy';
import { EnumTypeGenerator } from './enum-type-generator';
import { createFieldNode } from './field-nodes';
import { FilterAugmentation } from './filter-augmentation';
import { ListAugmentation } from './list-augmentation';
import { MetaTypeGenerator } from './meta-type-generator';
import { OrderByEnumGenerator, OrderByEnumType, OrderByEnumValue } from './order-by-enum-generator';
import {
    FieldContext,
    QueryNodeField,
    QueryNodeListType,
    QueryNodeNonNullType,
    QueryNodeOutputType
} from './query-node-object-type';
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
                orderByType.getValueOrThrow(
                    clause.field.path.replace('.', '_') +
                        (clause.direction === OrderDirection.ASCENDING ? '_ASC' : '_DESC')
                )
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
        let description = field.description;
        if (field.isParentField) {
            description +=
                (description ? '\n\n' : '') +
                `This field resolves to the ${field.type.name} embedding this child entity.`;
            if (!field.type.isRootEntityType) {
                description += ` Note that the value of this field is not available when this ${field.type.name} has been reached via a collect field.`;
            }
        }
        if (field.isRootField) {
            description +=
                (description ? '\n\n' : '') +
                `This field resolves to the ${field.type.name} embedding this child entity.`;
        }
        const schemaField: QueryNodeField = {
            name: field.name,
            type: field.isList ? new QueryNodeNonNullType(new QueryNodeListType(itemType)) : itemType,
            description,
            deprecationReason: field.deprecationReason,

            // normally, entity extensions are converted to an empty object if null, and normally query field nodes have
            // a check that they return null if the source node is null.
            // if we skip both, entity extensions will be passed as null, but they will only ever be used to look up
            // fields in them, and a FieldQueryNode returns null if the source is null.
            skipNullCheck: field.type.isEntityExtensionType,
            isPure: true,
            resolve: (sourceNode, args, info) => this.resolveField(field, sourceNode, info)
        };

        if (field.isList && field.type.isObjectType) {
            return [this.listAugmentation.augment(schemaField, field.type), this.createMetaField(field)];
        } else {
            return [schemaField];
        }
    }

    private resolveField(field: Field, sourceNode: QueryNode, fieldContext: FieldContext): QueryNode {
        /*
            {
                root {
                    // parent = null, root = null, this = root
                    relation {
                        // parent = null, root = null, this = relation
                        extension {
                            // parent = relation, root = relation, this = relation
                            child {
                                // parent = relation, root = relation, this = child
                                grandchild {
                                    // parent = child, root = relation, this = grandchild
                                    parent {
                                        // stack.up: => parent = relation, root = relation, this = child
                                        parent {

                                        }
                                    }
                                    root
                                }
                            }
                        }
                    }
                }
            }
         */

        // remember the field of this layer, will be used one layer deeper
        setFieldAtSelection(fieldContext.selectionTokenStack[fieldContext.selectionTokenStack.length - 1], field);
        const existingHierarchyFrame = getHierarchyStackFrame(
            fieldContext.selectionTokenStack[fieldContext.selectionTokenStack.length - 1]
        );
        const outerField = getFieldAtSelection(
            fieldContext.selectionTokenStack[fieldContext.selectionTokenStack.length - 2]
        );

        let collectRootNode: QueryNode | undefined;
        if (
            outerField &&
            this.shouldCaptureRootEntity(
                outerField,
                fieldContext.selectionStack[fieldContext.selectionStack.length - 2].fieldRequest
            )
        ) {
            collectRootNode = new PropertyAccessQueryNode(sourceNode, 'root');
            sourceNode = new PropertyAccessQueryNode(sourceNode, 'obj');
        }

        // if this is the first time at this layer, calculate the hierarchy frame for this layer
        let hierarchyFrame: HierarchyStackFrame;
        if (existingHierarchyFrame) {
            hierarchyFrame = existingHierarchyFrame;
        } else {
            const outerFrame = getHierarchyStackFrame(
                fieldContext.selectionTokenStack[fieldContext.selectionTokenStack.length - 2]
            );

            // regular fields (e.g. entity extensions) just keep parent/root. Only when we navigate into child or root
            // entities, we need to change them.
            if (!outerField || outerField.type.isRootEntityType) {
                // navigating into a root entity completely resets the hierarchy, you can never navigate "more up"
                // also, if there is no outer field, we're at a root field (single or multiple)
                hierarchyFrame = {
                    currentEntityNode: sourceNode,
                    rootEntityNode: sourceNode
                };
            } else if (outerField.collectPath) {
                const currentEntityNode =
                    outerField.type.isRootEntityType || outerField.type.isChildEntityType ? sourceNode : undefined;
                if (outerField.collectPath.traversesRootEntityTypes) {
                    // traversing root entities, so need to take new root. parent is not available.
                    hierarchyFrame = {
                        currentEntityNode,
                        rootEntityNode: collectRootNode
                    };
                } else {
                    // not traversing root entities just throw away the parent but keep root
                    hierarchyFrame = {
                        currentEntityNode,
                        rootEntityNode: outerFrame?.rootEntityNode
                    };
                }
            } else if (outerField.type.isChildEntityType) {
                hierarchyFrame = {
                    currentEntityNode: sourceNode,
                    parentEntityFrame: outerFrame,
                    rootEntityNode: outerFrame?.rootEntityNode
                };
            } else {
                // other than that, there are not any fields that cross entity boundaries
                hierarchyFrame = outerFrame || {};
            }
            setHierarchyStackFrame(
                fieldContext.selectionTokenStack[fieldContext.selectionTokenStack.length - 1],
                hierarchyFrame
            );
        }

        // parent fields that have root entity types are effectively root fields, and those are a bit easier to manage,
        // so use the logic for root fields in these cases.
        if (field.isRootField || (field.isParentField && field.type.isRootEntityType)) {
            if (!hierarchyFrame.rootEntityNode) {
                return new RuntimeErrorQueryNode(`Root entity is not available here`, { code: NOT_SUPPORTED_ERROR });
            }
            return hierarchyFrame.rootEntityNode;
        } else if (field.isParentField) {
            if (!hierarchyFrame.parentEntityFrame?.currentEntityNode) {
                return new RuntimeErrorQueryNode(`Parent entity is not available here`, { code: NOT_SUPPORTED_ERROR });
            }
            return hierarchyFrame.parentEntityFrame.currentEntityNode;
        }

        return createFieldNode(field, sourceNode, {
            skipNullFallbackForEntityExtensions: true,
            captureRootEntitiesOnCollectFields: this.shouldCaptureRootEntity(
                field,
                fieldContext.selectionStack[fieldContext.selectionStack.length - 1].fieldRequest
            )
        });
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

    @memorize()
    private shouldCaptureRootEntity(field: Field, fieldRequest: FieldRequest) {
        if (!field.collectPath) {
            return false;
        }

        // we will only ever need it for collect paths that cross both inter- and intra-root-entity fields
        // (and it's not allowed to capture it in other cases anyway)
        // we also only need it if the result is a child entity type. It can't be an entity extension (that would be a
        // validation error), and value objects can't declare parent fields.
        // note that isChildEntityType + traversesRootEntityTypes implies that there are field traversals as well.
        if (!field.type.isChildEntityType || !field.collectPath.traversesRootEntityTypes) {
            return false;
        }

        return this.selectsRootField(fieldRequest, field.type);
    }

    @memorize()
    private selectsRootField(fieldRequest: FieldRequest, type: ObjectType): boolean {
        // hasReachableRootField can be cached request-independently, so we can save the time to crawl the selections
        // if we know there aren't any reachable root fields
        if (!this.hasReachableRootField(type)) {
            return false;
        }

        // assumes that parent/root fields, child entity fields and entity extension fields are always called
        // exactly like in the model (to do this properly, using the output-type-generator itself, we would need several
        // passes, or we would need to run the query-node-generator upfront and associate metadata with the
        // QueryNodeFields

        return fieldRequest.selectionSet.some(f => {
            const field = type.getField(f.fieldRequest.field.name);
            if (!field) {
                return false;
            }
            if (field.isRootField || (field.isParentField && field.type.isRootEntityType)) {
                return true;
            }
            // don't walk out of the current root entity, we're not interested in them (that would change the root)
            if (
                (field.type.isChildEntityType || field.type.isEntityExtensionType) &&
                (!field.collectPath || !field.collectPath.traversesRootEntityTypes)
            ) {
                return this.selectsRootField(f.fieldRequest, field.type);
            }
            return false;
        });
    }

    /**
     * Determines whether a @root field can be reached from anywhere within the given type.
     *
     * Stops at root entity boundaries
     */
    @memorize()
    private hasReachableRootField(type: ObjectType): boolean {
        const seen = new Set<ObjectType>([type]);
        let fringe = [type];
        do {
            const newFringe: ObjectType[] = [];
            for (const type of fringe) {
                for (const field of type.fields) {
                    // parent fields of root entity types are basically root fields (and they will make use of captureRootEntity)
                    if (field.isRootField || (field.isParentField && field.type.isRootEntityType)) {
                        return true;
                    }
                    if (
                        (field.type.isChildEntityType || field.type.isEntityExtensionType) &&
                        !seen.has(field.type) &&
                        (!field.collectPath || !field.collectPath.traversesRootEntityTypes)
                    ) {
                        seen.add(type);
                        newFringe.push(type);
                    }
                }
            }
            fringe = newFringe;
        } while (fringe.length);
        return false;
    }
}
