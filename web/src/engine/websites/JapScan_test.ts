import { describe, expect, it } from 'vitest';
import { IsIncompleteReaderResult, IsVolumeChapter, MergePageLinks, MIN_READER_PAGES_FOR_COMPLETE_RESULT, ShouldCompleteWithDRM } from './JapScan';

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

    it('Should detect volume chapters by identifier or title', () => {
        expect(IsVolumeChapter({ Identifier: '/manga/dreamland/volume-24/', Title: 'Volume 24' })).toBe(true);
        expect(IsVolumeChapter({ Identifier: '/manga/dreamland/214/', Title: 'Chapitre 214' })).toBe(false);
        expect(IsVolumeChapter({ Identifier: '/manga/dreamland/214/', Title: 'Volume 24' })).toBe(true);
        expect(IsVolumeChapter({ Identifier: '/manga/dreamland/volume-24/', Title: 'Chapitre 214' })).toBe(true);
    });

    it('Should treat a result below the reader total as incomplete', () => {
        expect(IsIncompleteReaderResult(Array.from({ length: 110 }, (_, index) => `page-${index}`), 200)).toBe(true);
        expect(IsIncompleteReaderResult(Array.from({ length: 200 }, (_, index) => `page-${index}`), 200)).toBe(false);
        expect(IsIncompleteReaderResult(Array.from({ length: 210 }, (_, index) => `page-${index}`), 200)).toBe(false);
        expect(IsIncompleteReaderResult(Array.from({ length: 110 }, (_, index) => `page-${index}`), undefined)).toBe(false);
    });
});
