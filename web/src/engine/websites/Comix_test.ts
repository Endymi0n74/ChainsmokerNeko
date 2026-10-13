import { describe, it, expect } from 'vitest';
import { RequireWindowResult } from './Comix';

describe('RequireWindowResult', () => {

    it('should return the value delivered by the window', () => {
        expect(RequireWindowResult([ 'https://comix.to/page-1.webp' ], 'reader')).toEqual([ 'https://comix.to/page-1.webp' ]);
        expect(RequireWindowResult('The Spark in Your Eyes', 'title')).toBe('The Spark in Your Eyes');
        expect(RequireWindowResult([], 'catalogue')).toEqual([]);
    });

    it('should throw an explicit error when the window died before returning data', () => {
        // The platform resolves `undefined` instead of rejecting when the window vanished
        // mid-extraction (crash-safe path): without this guard the download task reported
        // `Cannot read properties of undefined (reading 'map')` instead of a usable message.
        expect(() => RequireWindowResult(undefined, 'reader'))
            .toThrow(/Comix: the reader window was closed before the site returned its data/);
        expect(() => RequireWindowResult(null, 'chapters'))
            .toThrow(/Comix: the chapters window was closed before the site returned its data/);
    });

    it('should tell the user how to recover', () => {
        expect(() => RequireWindowResult(undefined, 'reader')).toThrow(/retry/);
        expect(() => RequireWindowResult(undefined, 'reader')).toThrow(/security check/);
    });

});
