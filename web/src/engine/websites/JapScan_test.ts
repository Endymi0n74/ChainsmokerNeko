import { describe, expect, it } from 'vitest';
import { MergePageLinks, MIN_READER_PAGES_FOR_COMPLETE_RESULT, ShouldCompleteWithDRM } from './JapScan';

describe('JapScan page fallback helpers', () => {
    it('Should merge DRM pages before reader-only pages', () => {
        expect(MergePageLinks(['page-1', 'page-2'], ['page-2', 'page-3'])).toEqual([
            'page-1',
            'page-2',
            'page-3',
        ]);
    });

    it('Should use a small reader result as a signal for DRM completion', () => {
        expect(MIN_READER_PAGES_FOR_COMPLETE_RESULT).toBe(5);
        expect(ShouldCompleteWithDRM(['page-1', 'page-2', 'page-3'])).toBe(true);
        expect(ShouldCompleteWithDRM(['page-1', 'page-2', 'page-3', 'page-4', 'page-5'])).toBe(false);
    });
});
