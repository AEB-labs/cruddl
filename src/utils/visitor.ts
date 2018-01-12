import { isArray } from 'util';

export enum VisitAction {
    SKIP_NODE
}

export type Visitor<T> = {
    enter?(object: T, key: string|undefined): T | VisitAction,
    leave?(object: T, key: string|undefined): T
};

export function visitObject<T>(node: T, visitor: Visitor<any>, key?: string): T {
    const visitResult = enter(node, visitor, key);

    if (visitResult == VisitAction.SKIP_NODE) {
        return node;
    }

    if (visitResult != node) {
        return visitResult;
    }

    // not changed, so visit recursively
    const newFieldValues: {[name: string]: T} = {};
    let hasChanged = false;
    for (const field of Object.keys(node)) {
        const oldValue = (node as any)[field];
        const newValue = visitObjectOrArray(oldValue, visitor, field);
        if (newValue != oldValue) {
            newFieldValues[field] = newValue;
            hasChanged = true;
        }
    }

    if (hasChanged) {
        const newObj = Object.create(Object.getPrototypeOf(node));
        Object.assign(newObj, node, newFieldValues);
        node = newObj;
    }

    return leave(node, visitor, key);
}

function visitObjectOrArray<T>(nodeOrArray: T|T[], visitor: Visitor<any>, key: string|undefined): T|T[] {
    if (typeof nodeOrArray != 'object' || nodeOrArray === null) {
        return nodeOrArray;
    }
    if (!isArray(nodeOrArray)) {
        return visitObject(nodeOrArray as T, visitor, key);
    }
    return nodeOrArray.map(item => visitObject(item, visitor, key));
}

function enter<T>(obj: T, visitor: Visitor<any>, key: string|undefined): T|VisitAction {
    if (visitor.enter) {
        return visitor.enter(obj, key);
    }
    return obj;
}

function leave<T>(obj: T, visitor: Visitor<any>, key: string|undefined): T {
    if (visitor.leave) {
        return visitor.leave(obj, key);
    }
    return obj;
}
