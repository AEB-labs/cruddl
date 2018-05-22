import memorize from 'memorize-decorator';
import { expect } from 'chai';

describe('memorize-decorator', () => {
    it('memorizes method result with same arg', () => {
        const arg = {};

        class Test {
            @memorize()
            memorized(arg: any) {
                return {arg};
            }
        }

        const test = new Test();
        const res1 = test.memorized(arg);
        const res2 = test.memorized(arg);
        expect(res1).to.equal(res2);
    });

    it('does not memorize across instances', () => {
        const arg = {};

        class Test {
            @memorize()
            memorized(arg: any) {
                return {arg};
            }
        }

        const test1 = new Test();
        const res1 = test1.memorized(arg);
        const test2 = new Test();
        const res2 = test2.memorized(arg);
        expect(res1).to.not.equal(res2);
    });
});
