import { isArray } from 'util';

export enum VisitAction {
    SKIP_NODE
}

export type Visitor<T> = {
    enter?(object: T): T | VisitAction,
    leave?(object: T): T
};

export function visitObject<T>(node: T, visitor: Visitor<any>): T {
    const visitResult = enter(node, visitor);

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
        const newValue = visitObjectOrArray(oldValue, visitor);
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

    return leave(node, visitor);
}

function visitObjectOrArray<T>(nodeOrArray: T|T[], visitor: Visitor<any>): T|T[] {
    if (typeof nodeOrArray != 'object' || nodeOrArray === null) {
        return nodeOrArray;
    }
    if (!isArray(nodeOrArray)) {
        return visitObject(nodeOrArray as T, visitor);
    }
    return nodeOrArray.map(item => visitObject(item, visitor));
}

function enter<T>(obj: T, visitor: Visitor<any>): T|VisitAction {
    if (visitor.enter) {
        return visitor.enter(obj);
    }
    return obj;
}

function leave<T>(obj: T, visitor: Visitor<any>): T {
    if (visitor.leave) {
        return visitor.leave(obj);
    }
    return obj;
}
