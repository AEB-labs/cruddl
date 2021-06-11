import { Field } from '../model';
import { QueryNode } from '../query-tree';
import { SelectionToken } from './query-node-object-type';

const hierarchyStackFramesBySelection = new WeakMap<SelectionToken, HierarchyStackFrame>();
const fieldsBySelection = new WeakMap<SelectionToken, Field>();

export interface HierarchyStackFrame {
    readonly currentEntityNode?: QueryNode;
    readonly parentEntityFrame?: HierarchyStackFrame;
    // keep root explicitly because sometimes, we might have the root entity, but not the parent entity
    //readonly rootEntityNode?: QueryNode;
}

export function getHierarchyStackFrame(selectionToken: SelectionToken): HierarchyStackFrame | undefined {
    return hierarchyStackFramesBySelection.get(selectionToken);
}

export function setHierarchyStackFrame(selectionToken: SelectionToken, stackFrame: HierarchyStackFrame) {
    if (hierarchyStackFramesBySelection.has(selectionToken)) {
        throw new Error(`HierarchyStackFrame for this token already exists`);
    }
    hierarchyStackFramesBySelection.set(selectionToken, stackFrame);
}

export function getFieldAtSelection(selectionToken: SelectionToken): Field | undefined {
    return fieldsBySelection.get(selectionToken);
}

export function setFieldAtSelection(selectionToken: SelectionToken, field: Field) {
    if (fieldsBySelection.has(selectionToken)) {
        throw new Error(`Field for this token already exists`);
    }
    fieldsBySelection.set(selectionToken, field);
}
