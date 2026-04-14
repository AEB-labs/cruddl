import { describe, expect, it } from 'vitest';
import { parseIndexNumericId } from './parse-index-numeric-id.js';

describe('parseIndexNumericId', () => {
    it('parses "articles/461261886"', () => {
        expect(parseIndexNumericId('articles/461261886')).toBe(461261886);
    });

    it('parses "articles/0"', () => {
        expect(parseIndexNumericId('articles/0')).toBe(0);
    });

    it('returns undefined for undefined input', () => {
        expect(parseIndexNumericId(undefined)).toBeUndefined();
    });

    it('returns undefined for string without slash', () => {
        expect(parseIndexNumericId('no-slash')).toBeUndefined();
    });

    it('returns undefined for non-numeric part', () => {
        expect(parseIndexNumericId('articles/abc')).toBeUndefined();
    });

    it('returns undefined for floating-point', () => {
        expect(parseIndexNumericId('articles/1.5')).toBeUndefined();
    });
});
