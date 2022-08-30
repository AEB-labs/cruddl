import { AnyValue } from '../../src/utils/utils';
import { visitObject, VisitResult } from '../../src/utils/visitor';
import { expect } from 'chai';

describe('visitObject', () => {
    const a = { inA: true };
    const b = { inB: { deepB: true } };
    const composite = { a, b };

    describe('enter', () => {
        it('is called', () => {
            const visitedObjects: any[] = [];
            const visitedKeys: any[] = [];
            visitObject(composite, {
                enter(obj: AnyValue, key): VisitResult<any> {
                    visitedObjects.push(obj as any);
                    visitedKeys.push(key);
                    return { newValue: obj };
                },
            });
            expect(visitedObjects).to.deep.equal([composite, a, b, { deepB: true }]);
            expect(visitedKeys).to.deep.equal([undefined, 'a', 'b', 'inB']);
        });

        it('replaces objects with result', () => {
            const result = visitObject(composite, {
                enter: (obj: AnyValue) => {
                    if ((obj as any).inA) {
                        return { newValue: { inA: false }, recurse: true };
                    }
                    return { newValue: obj };
                },
            });
            expect(result).to.deep.equal({ a: { inA: false }, b: { inB: { deepB: true } } });
        });

        it('does not visit replacement objects if recurse is false', () => {
            const visitedObjects: any[] = [];
            const result = visitObject(composite, {
                enter: (obj: AnyValue) => {
                    visitedObjects.push(obj);
                    if ((obj as any).inA) {
                        return { recurse: false, newValue: { inA: { deepA: true } } };
                    }
                    return { newValue: obj };
                },
            });
            expect(visitedObjects).to.deep.equal([composite, a, b, { deepB: true }]);
        });

        it('visit replacement objects if recurse is true', () => {
            const visitedObjects: any[] = [];
            const result = visitObject(composite, {
                enter: (obj: AnyValue) => {
                    visitedObjects.push(obj);
                    if ((obj as any).inA) {
                        return { recurse: true, newValue: { inA: { deepA: true } } };
                    }
                    return { newValue: obj };
                },
            });
            expect(visitedObjects).to.deep.equal([
                composite,
                a,
                { deepA: true },
                b,
                { deepB: true },
            ]);
        });

        it('skips when SKIP_NODE is returned', () => {
            const visitedObjects: any[] = [];
            const result = visitObject(composite, {
                enter: (obj: AnyValue) => {
                    visitedObjects.push(obj);
                    if ((obj as any).inB) {
                        return { newValue: obj, recurse: false };
                    }
                    return { newValue: obj };
                },
            });
            expect(visitedObjects).to.deep.equal([composite, a, b]);
        });

        it('is called for each array item', () => {
            const items = [a, b];
            const listObj = { items };
            const visitedObjects: any[] = [];
            visitObject(listObj, {
                enter(obj: AnyValue) {
                    visitedObjects.push(obj as any);
                    return { newValue: obj };
                },
            });
            expect(visitedObjects).to.deep.equal([listObj, a, b, { deepB: true }]);
        });
    });

    describe('leave', () => {
        it('is called', () => {
            const visitedObjects: any[] = [];
            const visitedKeys: any[] = [];
            visitObject(composite, {
                leave(obj: AnyValue, key) {
                    visitedObjects.push(obj);
                    visitedKeys.push(key);
                    return obj;
                },
            });
            expect(visitedObjects).to.deep.equal([a, { deepB: true }, b, composite]);
            expect(visitedKeys).to.deep.equal(['a', 'inB', 'b', undefined]);
        });

        it('replaces objects with result', () => {
            const result = visitObject(composite, {
                leave: (obj: AnyValue) => {
                    if ((obj as any).inA) {
                        return { inA: false };
                    }
                    return obj;
                },
            });
            expect(result).to.deep.equal({ a: { inA: false }, b: { inB: { deepB: true } } });
        });
    });
});
