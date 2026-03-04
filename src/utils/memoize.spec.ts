import { describe, expect, it } from 'vitest';
import { memoize } from './memoize.js';

describe('@memoize()', () => {
    it('memoizes zero-arg methods', () => {
        let calls = 0;

        class Test {
            @memoize()
            value() {
                calls++;
                return { value: 'ok' };
            }
        }

        const instance = new Test();
        const first = instance.value();
        const second = instance.value();

        expect(first).to.equal(second);
        expect(calls).to.equal(1);
    });

    it('memoizes methods by full argument list and order', () => {
        let calls = 0;

        class Test {
            @memoize()
            tuple(a: unknown, b: unknown) {
                calls++;
                return { a, b };
            }
        }

        const instance = new Test();
        const first = instance.tuple(1, 2);
        const second = instance.tuple(1, 2);
        const reversed = instance.tuple(2, 1);

        expect(first).to.equal(second);
        expect(reversed).to.not.equal(first);
        expect(calls).to.equal(2);
    });

    it('uses object identity for object arguments', () => {
        let calls = 0;

        class Test {
            @memoize()
            fromObject(input: object) {
                calls++;
                return { input };
            }
        }

        const instance = new Test();
        const arg1 = { same: true };
        const arg2 = { same: true };

        const first = instance.fromObject(arg1);
        const second = instance.fromObject(arg1);
        const third = instance.fromObject(arg2);

        expect(first).to.equal(second);
        expect(third).to.not.equal(first);
        expect(calls).to.equal(2);
    });

    it('handles primitive edge cases like undefined, null, and NaN', () => {
        let calls = 0;

        class Test {
            @memoize()
            fromPrimitive(input: unknown) {
                calls++;
                return { input };
            }
        }

        const instance = new Test();

        const undefined1 = instance.fromPrimitive(undefined);
        const undefined2 = instance.fromPrimitive(undefined);
        const null1 = instance.fromPrimitive(null);
        const null2 = instance.fromPrimitive(null);
        const nan1 = instance.fromPrimitive(Number.NaN);
        const nan2 = instance.fromPrimitive(Number.NaN);

        expect(undefined1).to.equal(undefined2);
        expect(null1).to.equal(null2);
        expect(nan1).to.equal(nan2);
        expect(calls).to.equal(3);
    });

    it('does not memoize across instances', () => {
        let calls = 0;

        class Test {
            @memoize()
            value(input: object) {
                calls++;
                return { input };
            }
        }

        const arg = {};
        const firstInstance = new Test();
        const secondInstance = new Test();

        const first = firstInstance.value(arg);
        const second = secondInstance.value(arg);

        expect(first).to.not.equal(second);
        expect(calls).to.equal(2);
    });

    it('memoizes getters per instance', () => {
        let calls = 0;

        class Test {
            @memoize()
            get computed() {
                calls++;
                return { value: calls };
            }
        }

        const firstInstance = new Test();
        const secondInstance = new Test();

        const first1 = firstInstance.computed;
        const first2 = firstInstance.computed;
        const second1 = secondInstance.computed;

        expect(first1).to.equal(first2);
        expect(first1).to.not.equal(second1);
        expect(calls).to.equal(2);
    });

    it('keeps caches isolated between different decorated methods', () => {
        let firstCalls = 0;
        let secondCalls = 0;

        class Test {
            @memoize()
            first(input: number) {
                firstCalls++;
                return { input };
            }

            @memoize()
            second(input: number) {
                secondCalls++;
                return { input };
            }
        }

        const instance = new Test();
        const first1 = instance.first(5);
        const first2 = instance.first(5);
        const second1 = instance.second(5);
        const second2 = instance.second(5);

        expect(first1).to.equal(first2);
        expect(second1).to.equal(second2);
        expect(first1).to.not.equal(second1);
        expect(firstCalls).to.equal(1);
        expect(secondCalls).to.equal(1);
    });

    it('preserves method this behavior while memoizing', () => {
        class Test {
            constructor(private readonly factor: number) {}

            @memoize()
            multiply(input: number) {
                return { value: this.factor * input };
            }
        }

        const instance = new Test(3);
        const first = instance.multiply(4);
        const second = instance.multiply(4);

        expect(first).to.equal(second);
        expect(first.value).to.equal(12);
    });

    it('does not cache thrown errors', () => {
        let calls = 0;

        class Test {
            @memoize()
            alwaysFails() {
                calls++;
                throw new Error('boom');
            }
        }

        const instance = new Test();

        expect(() => instance.alwaysFails()).to.throw('boom');
        expect(() => instance.alwaysFails()).to.throw('boom');
        expect(calls).to.equal(2);
    });

    it('memoizes promise-returning methods by argument identity', async () => {
        let calls = 0;

        class Test {
            @memoize()
            asyncValue(input: object): Promise<object> {
                calls++;
                return Promise.resolve({ input });
            }
        }

        const arg = {};
        const instance = new Test();

        const firstPromise = instance.asyncValue(arg);
        const secondPromise = instance.asyncValue(arg);

        expect(firstPromise).to.equal(secondPromise);
        await expect(firstPromise).resolves.to.deep.equal({ input: arg });
        expect(calls).to.equal(1);
    });

    it('preserves decorated function name where possible', () => {
        class Test {
            @memoize()
            namedMethod() {
                return 1;
            }
        }

        const descriptor = Object.getOwnPropertyDescriptor(Test.prototype, 'namedMethod');
        expect(descriptor?.value.name).to.equal('namedMethod');
    });

    it('throws when applied to unsupported decorator kinds', () => {
        const decorator = memoize() as unknown as (
            value: undefined,
            context: ClassFieldDecoratorContext,
        ) => void;

        expect(() => {
            class InvalidUsage {
                @decorator
                field = 1;
            }

            return InvalidUsage;
        }).to.throw('@memoize() can only be applied to methods and getters');
    });
});
