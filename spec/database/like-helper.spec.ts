import { expect } from 'chai';
import { analyzeLikePatternPrefix, likePatternToRegExp } from '../../src/database/like-helpers';

describe('like-helper', () => {
    describe('analyzeLikePatternPrefix', () => {
        it('finds complete literal pattern', () => {
            const { isSimplePrefixPattern, literalPrefix } = analyzeLikePatternPrefix('test');
            expect(isSimplePrefixPattern).to.be.false;
            expect(literalPrefix).to.equal('test');
        });

        it('properly unescapes special chars', () => {
            const { isSimplePrefixPattern, literalPrefix } =
                analyzeLikePatternPrefix('test \\% \\\\ \\_');
            expect(isSimplePrefixPattern).to.be.false;
            expect(literalPrefix).to.equal('test % \\ _');
        });

        it('leaves badly escaped characters as-is', () => {
            const { isSimplePrefixPattern, literalPrefix } =
                analyzeLikePatternPrefix('test \\a \\');
            expect(isSimplePrefixPattern).to.be.false;
            expect(literalPrefix).to.equal('test \\a \\');
        });

        it('treats % as placeholder', () => {
            const { isSimplePrefixPattern, literalPrefix } =
                analyzeLikePatternPrefix('test % suffix');
            expect(isSimplePrefixPattern).to.be.false;
            expect(literalPrefix).to.equal('test ');
        });

        it('identifies prefix patterns', () => {
            const { isSimplePrefixPattern, literalPrefix } = analyzeLikePatternPrefix('test %');
            expect(isSimplePrefixPattern).to.be.true;
            expect(literalPrefix).to.equal('test ');
        });

        it('identifies prefix patterns with repeated % placeholders', () => {
            const { isSimplePrefixPattern, literalPrefix } = analyzeLikePatternPrefix('test %%%');
            expect(isSimplePrefixPattern).to.be.true;
            expect(literalPrefix).to.equal('test ');
        });

        it('treats _ as placeholder', () => {
            const { isSimplePrefixPattern, literalPrefix } =
                analyzeLikePatternPrefix('test _ suffix');
            expect(isSimplePrefixPattern).to.be.false;
            expect(literalPrefix).to.equal('test ');
        });

        it('returns empty prefix if placeholder is at start', () => {
            const { isSimplePrefixPattern, literalPrefix } = analyzeLikePatternPrefix('%suffix');
            expect(isSimplePrefixPattern).to.be.false;
            expect(literalPrefix).to.equal('');
        });

        it('returns empty prefix for empty string', () => {
            const { isSimplePrefixPattern, literalPrefix } = analyzeLikePatternPrefix('');
            expect(isSimplePrefixPattern).to.be.false;
            expect(literalPrefix).to.equal('');
        });
    });

    describe('likePatternToRegExp', () => {
        it('produces case-insensitive regexps', () => {
            expect(likePatternToRegExp('abc').flags).to.equal('i');
        });

        it('works for empty string', () => {
            expect(likePatternToRegExp('').source).to.equal(/^$/.source);
        });

        it('works for regular literals', () => {
            expect(likePatternToRegExp('a, b').source).to.equal(/^a, b$/.source);
        });

        it('escapes special literals', () => {
            expect(likePatternToRegExp('test (+[.').source).to.equal(/^test \(\+\[\.$/.source);
        });

        it('unescapes like literals', () => {
            expect(likePatternToRegExp('test \\_').source).to.equal(/^test _$/.source);
        });

        it('translates % properly', () => {
            expect(likePatternToRegExp('test % suffix').source).to.equal(
                /^test ([\s\S]*) suffix$/.source,
            );
        });

        it('translates _ properly', () => {
            expect(likePatternToRegExp('test _ suffix').source).to.equal(
                /^test [\s\S] suffix$/.source,
            );
        });

        it('matches a simple pattern', () => {
            expect('prefix test SUFFIX').to.match(likePatternToRegExp('prefix % suffix'));
            expect('prefix test SUFFI').to.not.match(likePatternToRegExp('prefix % suffix'));
        });

        it('matches a complex pattern', () => {
            // make sure the dot is escaped
            expect('test.value\\_suffix').to.match(likePatternToRegExp('test.%\\_suffix'));
            expect('test,value\\_suffix').not.to.match(likePatternToRegExp('test.%\\_suffix'));
            expect('blahtest.value\\_suffix').not.to.match(likePatternToRegExp('test.%\\_suffix'));
        });
    });
});
