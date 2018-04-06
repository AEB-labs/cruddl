import { isArray } from 'util';

export type VisitResult<T> = {
    recurse?: boolean
    newValue: T
}

export type Visitor<T> = {
    enter?(object: T, key: string|undefined): VisitResult<T>,
    leave?(object: T, key: string|undefined): T
};

export function visitObject<T>(node: T, visitor: Visitor<T>): T {
    return visitObject0(node, visitor);
}

function visitObject0<T>(node: T, visitor: Visitor<T>, key?: string): T {
    const { newValue, recurse } = enter(node, visitor, key);

    // recurse defaults to true
    const finalValue = recurse === false ? newValue : visitObjectProperties(newValue, visitor);

    return leave<T>(finalValue, visitor, key);
}

function visitObjectProperties<T>(object: T, visitor: Visitor<T>): T {
    const newFieldValues: { [name: string]: T } = {};
    let hasChanged = false;
    for (const field of Object.keys(object)) {
        const oldValue = (object as any)[field];
        const newValue = visitObjectOrArray(oldValue, visitor, field);
        if (newValue != oldValue) {
            newFieldValues[field] = newValue;
            hasChanged = true;
        }
    }

    if (!hasChanged) {
        return object;
    }

    const newObj = Object.create(Object.getPrototypeOf(object));
    Object.assign(newObj, object, newFieldValues);
    return newObj;
}

function visitObjectOrArray<T>(nodeOrArray: T|T[], visitor: Visitor<any>, key: string|undefined): T|T[] {
    if (typeof nodeOrArray != 'object' || nodeOrArray === null) {
        return nodeOrArray;
    }
    if (!isArray(nodeOrArray)) {
        return visitObject0(nodeOrArray as T, visitor, key);
    }
    return nodeOrArray.map(item => visitObject0(item, visitor, key));
}

function enter<T>(obj: T, visitor: Visitor<T>, key: string|undefined): VisitResult<T> {
    if (visitor.enter) {
        return visitor.enter(obj, key);
    }
    return { newValue: obj };
}

function leave<T>(obj: T, visitor: Visitor<T>, key: string|undefined): T {
    if (visitor.leave) {
        return visitor.leave(obj, key);
    }
    return obj;
}
