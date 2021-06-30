import memorize from 'memorize-decorator';
import { FieldRequest } from '../graphql/query-distiller';
import { Field, ObjectType } from '../model';
import { NOT_SUPPORTED_ERROR, PropertyAccessQueryNode, QueryNode, RuntimeErrorQueryNode } from '../query-tree';
import { FieldContext, SelectionToken } from './query-node-object-type';

export interface ProcessFieldResult {
    /**
     * If the RootFieldHelper can already resolve this fields, this will be populated with the value.
     */
    readonly resultNode: QueryNode | undefined;

    /**
     * The source node, which might differ from the sourceNode passed in in case of root entity capture.
     *
     * Only relevant if resultNode is undefined.
     */
    readonly sourceNode: QueryNode;

    /**
     * if this field is a collect field, specifies whether it should capture root entities
     */
    readonly captureRootEntitiesOnCollectFields: boolean;
}

interface HierarchyStackFrame {
    readonly currentEntityNode?: QueryNode;
    readonly parentEntityFrame?: HierarchyStackFrame;
    // keep root explicitly because sometimes, we might have the root entity, but not the parent entity
    readonly rootEntityNode?: QueryNode;
}

export class RootFieldHelper {
    private readonly hierarchyStackFramesBySelection = new WeakMap<SelectionToken, HierarchyStackFrame>();
    private readonly fieldsBySelection = new WeakMap<SelectionToken, Field>();
    private readonly selectionsThatCaptureRootEntities = new WeakSet<SelectionToken>();

    /**
     * Should be called whenever a field is resolved. Will maintain a hierarchy structure, and may produce a value node
     */
    processField(field: Field, sourceNode: QueryNode, fieldContext: FieldContext): ProcessFieldResult {
        const parentSelectionToken =
            fieldContext.selectionTokenStack.length >= 2
                ? fieldContext.selectionTokenStack[fieldContext.selectionTokenStack.length - 2]
                : new SelectionToken();

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
        this.setFieldAtSelection(fieldContext.selectionToken, field);
        const existingHierarchyFrame = this.getHierarchyStackFrame(fieldContext.selectionToken);
        const outerField = this.getFieldAtSelection(parentSelectionToken);

        let collectRootNode: QueryNode | undefined;
        if (this.capturesRootEntity(parentSelectionToken)) {
            collectRootNode = new PropertyAccessQueryNode(sourceNode, 'root');
            // we will return the sourceNode below
            sourceNode = new PropertyAccessQueryNode(sourceNode, 'obj');
        }

        // if this is the first time at this layer, calculate the hierarchy frame for this layer
        let hierarchyFrame: HierarchyStackFrame;
        if (existingHierarchyFrame) {
            hierarchyFrame = existingHierarchyFrame;
        } else {
            const outerFrame = this.getHierarchyStackFrame(parentSelectionToken);

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
            this.setHierarchyStackFrame(fieldContext.selectionToken, hierarchyFrame);
        }

        const captureRootEntitiesOnCollectFields = this.shouldCaptureRootEntity(
            field,
            fieldContext.selectionStack[fieldContext.selectionStack.length - 1].fieldRequest
        );

        if (captureRootEntitiesOnCollectFields) {
            this.selectionsThatCaptureRootEntities.add(fieldContext.selectionToken);
        }

        return {
            sourceNode,
            resultNode: this.tryResolveField(field, hierarchyFrame),
            captureRootEntitiesOnCollectFields
        };
    }

    getRealItemNode(itemNode: QueryNode, fieldContext: FieldContext) {
        if (this.capturesRootEntity(fieldContext.selectionToken)) {
            return new PropertyAccessQueryNode(itemNode, 'obj');
        }
        return itemNode;
    }

    /**
     * Determines whether a selection has been instructed (by captureRootEntitiesOnCollectFields) to capture root entities
     */
    capturesRootEntity(selectionToken: SelectionToken) {
        return this.selectionsThatCaptureRootEntities.has(selectionToken);
    }

    private tryResolveField(field: Field, hierarchyFrame: HierarchyStackFrame): QueryNode | undefined {
        let resultNode: QueryNode | undefined;
        // parent fields that have root entity types are effectively root fields, and those are a bit easier to manage,
        // so use the logic for root fields in these cases.
        if (field.isRootField || (field.isParentField && field.type.isRootEntityType)) {
            if (!hierarchyFrame.rootEntityNode) {
                return new RuntimeErrorQueryNode(`Root entity is not available here`, { code: NOT_SUPPORTED_ERROR });
            } else {
                return hierarchyFrame.rootEntityNode;
            }
        } else if (field.isParentField) {
            if (!hierarchyFrame.parentEntityFrame?.currentEntityNode) {
                return new RuntimeErrorQueryNode(`Parent entity is not available here`, { code: NOT_SUPPORTED_ERROR });
            }
            return hierarchyFrame.parentEntityFrame.currentEntityNode;
        }
        return undefined;
    }

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

    // caching is helpful because it might get called further down in the hierarchy again
    // caching is ok because it only keeps a small boolean in the case of a kept-alive FieldRequest
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
                        seen.add(field.type);
                        newFringe.push(field.type);
                    }
                }
            }
            fringe = newFringe;
        } while (fringe.length);
        return false;
    }

    private getHierarchyStackFrame(selectionToken: SelectionToken): HierarchyStackFrame | undefined {
        return this.hierarchyStackFramesBySelection.get(selectionToken);
    }

    private setHierarchyStackFrame(selectionToken: SelectionToken, stackFrame: HierarchyStackFrame) {
        if (this.hierarchyStackFramesBySelection.has(selectionToken)) {
            throw new Error(`HierarchyStackFrame for this token already exists`);
        }
        this.hierarchyStackFramesBySelection.set(selectionToken, stackFrame);
    }

    private getFieldAtSelection(selectionToken: SelectionToken): Field | undefined {
        return this.fieldsBySelection.get(selectionToken);
    }

    private setFieldAtSelection(selectionToken: SelectionToken, field: Field) {
        if (this.fieldsBySelection.has(selectionToken)) {
            throw new Error(`Field for this token already exists`);
        }
        this.fieldsBySelection.set(selectionToken, field);
    }
}
