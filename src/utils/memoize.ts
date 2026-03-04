type MemoizedFunction<TThis, TArgs extends ReadonlyArray<unknown>, TResult> = (
    this: TThis,
    ...args: TArgs
) => TResult;

export function memoize(): {
    <TThis, TArgs extends ReadonlyArray<unknown>, TResult>(
        target: MemoizedFunction<TThis, TArgs, TResult>,
        context: ClassMethodDecoratorContext<TThis, MemoizedFunction<TThis, TArgs, TResult>>,
    ): MemoizedFunction<TThis, TArgs, TResult>;
    <TThis, TResult>(
        target: MemoizedFunction<TThis, [], TResult>,
        context: ClassGetterDecoratorContext<TThis, TResult>,
    ): MemoizedFunction<TThis, [], TResult>;
} {
    return (
        target: (...args: ReadonlyArray<unknown>) => unknown,
        context: ClassMethodDecoratorContext | ClassGetterDecoratorContext,
    ) => {
        if (context.kind !== 'method' && context.kind !== 'getter') {
            throw new TypeError('@memoize() can only be applied to methods and getters');
        }

        return createMemoizedFunction(target);
    };
}

function createMemoizedFunction<TThis, TArgs extends ReadonlyArray<unknown>, TResult>(
    originalFn: MemoizedFunction<TThis, TArgs, TResult>,
): MemoizedFunction<TThis, TArgs, TResult> {
    const root = new CacheNode();

    function memoized(this: TThis, ...args: TArgs): TResult {
        let node = root.ensureChild(this);
        for (const arg of args) {
            node = node.ensureChild(arg);
        }

        if (node.hasValue) {
            return node.value as TResult;
        }

        const value = originalFn.call(this, ...args);
        node.hasValue = true;
        node.value = value;
        return value;
    }

    try {
        Object.defineProperty(memoized, 'name', { value: originalFn.name });
    } catch {
        // ignore when function name cannot be reassigned
    }

    return memoized;
}

class CacheNode {
    readonly objectChildren = new WeakMap<object, CacheNode>();
    readonly primitiveChildren = new Map<unknown, CacheNode>();
    hasValue = false;
    value: unknown;

    getChild(key: unknown): CacheNode | undefined {
        if (isObjectLike(key)) {
            return this.objectChildren.get(key);
        }

        return this.primitiveChildren.get(key);
    }

    ensureChild(key: unknown): CacheNode {
        const existing = this.getChild(key);
        if (existing) {
            return existing;
        }

        const next = new CacheNode();
        if (isObjectLike(key)) {
            this.objectChildren.set(key, next);
        } else {
            this.primitiveChildren.set(key, next);
        }
        return next;
    }
}

function isObjectLike(value: unknown): value is object {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
