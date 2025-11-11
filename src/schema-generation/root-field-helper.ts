import memorize from 'memorize-decorator';
import { FieldRequest } from '../graphql/query-distiller';
import { Field, ObjectType } from '../model';
import {
    NOT_SUPPORTED_ERROR,
    PropertyAccessQueryNode,
    QueryNode,
    RuntimeErrorQueryNode,
} from '../query-tree';
import { FieldContext, SelectionToken } from './query-node-object-type';

export interface ProcessFieldResult {
    /**
     * If the RootFieldHelper can already resolve this fields, this will be populated with the value.
     */
    readonly resultNode: QueryNode | undefined;

    /**
     * Call this on collect fields that traverse root entities to store a reference to the root entity in the stack
     */
    registerRootNode(rootNode: QueryNode): void;
}

interface HierarchyStackFrame {
    readonly currentEntityNode?: QueryNode;
    readonly parentEntityFrame?: HierarchyStackFrame;
    readonly rootEntityNode?: QueryNode;

    // keep root explicitly because sometimes, we might have the root entity, but not the parent entity
    // set by registerRootNode()
    rootEntityNodeForChildFrames?: QueryNode;
}

export class RootFieldHelper {
    private readonly hierarchyStackFramesBySelection = new WeakMap<
        SelectionToken,
        HierarchyStackFrame
    >();
    private readonly fieldsBySelection = new WeakMap<SelectionToken, Field>();

    /**
     * Should be called whenever a field is resolved. Will maintain a hierarchy structure, and may produce a value node
     */
    processField(
        field: Field,
        sourceNode: QueryNode,
        fieldContext: FieldContext,
    ): ProcessFieldResult {
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
                    rootEntityNode: sourceNode,
                };
            } else if (outerField.collectPath) {
                const currentEntityNode =
                    outerField.type.isRootEntityType || outerField.type.isChildEntityType
                        ? sourceNode
                        : undefined;
                if (outerField.collectPath.traversesRootEntityTypes) {
                    // traversing root entities, so need to take new root. parent is not available.
                    hierarchyFrame = {
                        currentEntityNode,
                        rootEntityNode: outerFrame?.rootEntityNodeForChildFrames,
                    };
                } else {
                    // not traversing root entities just throw away the parent but keep root
                    hierarchyFrame = {
                        currentEntityNode,
                        rootEntityNode: outerFrame?.rootEntityNode,
                    };
                }
            } else if (outerField.type.isChildEntityType) {
                hierarchyFrame = {
                    currentEntityNode: sourceNode,
                    parentEntityFrame: outerFrame,
                    rootEntityNode: outerFrame?.rootEntityNode,
                };
            } else {
                // other than that, there are not any fields that cross entity boundaries
                hierarchyFrame = outerFrame || {};
            }
            this.setHierarchyStackFrame(fieldContext.selectionToken, hierarchyFrame);
        }

        return {
            resultNode: this.tryResolveField(field, hierarchyFrame),
            registerRootNode(rootNode: QueryNode) {
                if (hierarchyFrame.rootEntityNodeForChildFrames) {
                    throw new Error(
                        `Root query node already registered for field "${field.declaringType.name}.${field.name}"`,
                    );
                }
                hierarchyFrame.rootEntityNodeForChildFrames = rootNode;
            },
        };
    }

    private tryResolveField(
        field: Field,
        hierarchyFrame: HierarchyStackFrame,
    ): QueryNode | undefined {
        // parent fields that have root entity types are effectively root fields, and those are a bit easier to manage,
        // so use the logic for root fields in these cases.
        if (field.isRootField || (field.isParentField && field.type.isRootEntityType)) {
            if (!hierarchyFrame.rootEntityNode) {
                return new RuntimeErrorQueryNode(`Root entity is not available here`, {
                    code: NOT_SUPPORTED_ERROR,
                });
            }

            return hierarchyFrame.rootEntityNode;
        }

        if (field.isParentField) {
            if (!hierarchyFrame.parentEntityFrame?.currentEntityNode) {
                return new RuntimeErrorQueryNode(`Parent entity is not available here`, {
                    code: NOT_SUPPORTED_ERROR,
                });
            }

            return hierarchyFrame.parentEntityFrame.currentEntityNode;
        }

        return undefined;
    }

    private getHierarchyStackFrame(
        selectionToken: SelectionToken,
    ): HierarchyStackFrame | undefined {
        return this.hierarchyStackFramesBySelection.get(selectionToken);
    }

    private setHierarchyStackFrame(
        selectionToken: SelectionToken,
        stackFrame: HierarchyStackFrame,
    ) {
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
