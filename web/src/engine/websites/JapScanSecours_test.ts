import { describe, expect, it } from 'vitest';
import JapScanSecours, { IsIncompleteReaderResult, IsVolumeChapter, MergePageLinks, MIN_READER_PAGES_FOR_COMPLETE_RESULT, ShouldCompleteWithDRM } from './JapScanSecours';

describe('JapScan (secours) page fallback helpers', () => {

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

describe('JapScan (secours) connector', () => {

    const connector = new JapScanSecours();

    it('Should expose the japscan-secours identifier', () => {
        expect(connector.Identifier).toBe('japscan-secours');
    });

    it('Should require a visible browser window for the interactive challenge', () => {
        expect(connector.RequiresVisibleBrowserWindow).toBe(true);
    });

    it('Should accept JapScan manga, manhwa and bd URLs', () => {
        expect(connector.ValidateMangaURL('https://www.japscan.foo/manga/blue-lock/')).toBe(true);
        expect(connector.ValidateMangaURL('https://japscan.to/manhwa/demo/')).toBe(true);
        expect(connector.ValidateMangaURL('https://www.japscan.foo/bd/demo/')).toBe(true);
    });

    it('Should reject foreign hosts and non-manga paths', () => {
        expect(connector.ValidateMangaURL('https://example.com/manga/blue-lock/')).toBe(false);
        expect(connector.ValidateMangaURL('https://www.japscan.foo/mangas/?p=1')).toBe(false);
        expect(connector.ValidateMangaURL('not a url')).toBe(false);
    });
});
