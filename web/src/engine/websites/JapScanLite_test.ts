import { describe, it, expect } from 'vitest';
import JapScanLite from './JapScanLite';

describe('JapScanLite', () => {

    const connector = new JapScanLite();

    it('Should expose a distinct identifier from the full JapScan connector', () => {
        expect(connector.Identifier).toBe('japscan-lite');
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
