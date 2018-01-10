import { VisitAction, visitObject } from '../../src/utils/visitor';

describe('visitObject', () => {
    const a = {inA: true};
    const b = {inB: {deepB: true}};
    const composite = {a, b};

    describe('enter', () => {
        it('is called', () => {
            const visitedObjects: any[] = [];
            visitObject(composite, {
                enter(obj: any) {
                    visitedObjects.push(obj);
                    return obj;
                }
            });
            expect(visitedObjects).toEqual([composite, a, b, {deepB: true}]);
        });

        it('replaces objects with result', () => {
            const result = visitObject(composite, {
                enter: (obj: any) => {
                    if (obj.inA) {
                        return {inA: false};
                    }
                    return obj;
                }
            });
            expect(result).toEqual({a: {inA: false}, b: {inB: {deepB: true}}});
        });

        it('does not visit replacement objects', () => {
            const visitedObjects: any[] = [];
            const result = visitObject(composite, {
                enter: (obj: any) => {
                    visitedObjects.push(obj);
                    if (obj.inA) {
                        return {inA: {deepA: true}};
                    }
                    return obj;
                }
            });
            expect(visitedObjects).toEqual([composite, a, b, {deepB: true}]);
        });

        it('skips when SKIP_NODE is returned', () => {
            const visitedObjects: any[] = [];
            const result = visitObject(composite, {
                enter: (obj: any) => {
                    visitedObjects.push(obj);
                    if (obj.inB) {
                        return VisitAction.SKIP_NODE;
                    }
                    return obj;
                }
            });
            expect(visitedObjects).toEqual([composite, a, b]);
        });

        it('is called for each array item', () => {
            const items = [a, b];
            const listObj = {items};
            const visitedObjects: any[] = [];
            visitObject(listObj, {
                enter(obj: any) {
                    visitedObjects.push(obj);
                    return obj;
                }
            });
            expect(visitedObjects).toEqual([listObj, a, b, {deepB: true}]);
        });
    });

    describe('leave', () => {
        it('is called', () => {
            const visitedObjects: any[] = [];
            visitObject(composite, {
                leave(obj: any) {
                    visitedObjects.push(obj);
                    return obj;
                }
            });
            expect(visitedObjects).toEqual([a, {deepB: true}, b, composite]);
        });

        it('replaces objects with result', () => {
            const result = visitObject(composite, {
                leave: (obj: any) => {
                    if (obj.inA) {
                        return {inA: false};
                    }
                    return obj;
                }
            });
            expect(result).toEqual({a: {inA: false}, b: {inB: {deepB: true}}});
        });
    });
});
