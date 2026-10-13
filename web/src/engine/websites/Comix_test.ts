import { vi, describe, it, expect, beforeEach } from 'vitest';
import { FetchWindowPreloadScript } from '../platform/FetchProvider';
import { Manga, type MangaPlugin } from '../providers/MangaPlugin';
import ComixScraper, { RequireWindowResult } from './Comix';

vi.mock('../platform/FetchProvider', () => ({
    Fetch: vi.fn(),
    FetchWindowPreloadScript: vi.fn(),
}));

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

describe('Comix chapter list', () => {

    const payload = [ { id: 1, number: 1, name: 'Start', group: null } ];
    let scraper: ComixScraper;
    let manga: Manga;

    beforeEach(() => {
        vi.mocked(FetchWindowPreloadScript).mockReset();
        scraper = new ComixScraper();
        manga = new Manga(scraper, {} as MangaPlugin, '/title/the-spark', 'The Spark');
    });

    it('should reuse the cached chapter list instead of opening a new window', async () => {
        vi.mocked(FetchWindowPreloadScript).mockResolvedValue(payload);
        const first = await scraper.FetchChapters(manga);
        const second = await scraper.FetchChapters(manga);
        expect(second.map(chapter => chapter.Identifier)).toEqual(first.map(chapter => chapter.Identifier));
        expect(FetchWindowPreloadScript).toHaveBeenCalledTimes(1);
    });

    it('should share a single window between concurrent callers', async () => {
        vi.mocked(FetchWindowPreloadScript).mockResolvedValue(payload);
        const [ a, b ] = await Promise.all([ scraper.FetchChapters(manga), scraper.FetchChapters(manga) ]);
        expect(a).toHaveLength(1);
        expect(b).toHaveLength(1);
        expect(FetchWindowPreloadScript).toHaveBeenCalledTimes(1);
    });

    it('should not cache an empty list, so a challenged extraction is retried', async () => {
        vi.mocked(FetchWindowPreloadScript).mockResolvedValueOnce([]).mockResolvedValueOnce(payload);
        expect(await scraper.FetchChapters(manga)).toHaveLength(0);
        expect(await scraper.FetchChapters(manga)).toHaveLength(1);
        expect(FetchWindowPreloadScript).toHaveBeenCalledTimes(2);
    });

});
