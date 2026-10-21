import { describe, it, expect } from 'vitest';
import { IsComixUnsupportedPage, RequireWindowResult } from './Comix';

describe('IsComixUnsupportedPage', () => {

    it('should recognize the explicit third-party-app denial regardless of case or placement', () => {
        expect(IsComixUnsupportedPage('Third-party apps are not supported', '')).toBe(true);
        expect(IsComixUnsupportedPage('Comix', "We don't support third-party apps or extensions for this site.")).toBe(true);
        expect(IsComixUnsupportedPage('The Spark in Your Eyes', 'A normal manga page')).toBe(false);
    });

});

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
