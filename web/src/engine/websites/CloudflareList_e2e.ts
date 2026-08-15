import { describe, it, expect } from 'vitest';
import { PuppeteerFixture } from '../../../../test/PuppeteerFixture';
import type { Manga } from '../providers/MangaPlugin';

type ListingResult = {
    error?: string;
    count?: number;
};

type ChapterFlowResult = {
    error?: string;
    chapters?: number;
    pages?: number;
    image?: { ok: boolean; size: number; type: string };
};

type FlowArgs = {
    id: string;
    mangaURL: string;
    chapterID: string;
};

async function ListMangas(pluginID: string): Promise<ListingResult> {
    const fixture = new PuppeteerFixture();
    const page = await fixture.GetPage();
    return page.evaluate(async (id: string): Promise<ListingResult> => {
        const plugin = window.HakuNeko.PluginController.WebsitePlugins.find(website => website.Identifier === id);
        if(!plugin) {
            return { error: `Website plugin not found: ${id}` };
        }
        try {
            await plugin.Update();
            return { count: plugin.Entries.Value.length };
        } catch(error) {
            return { error: String(error instanceof Error ? error.message : error) };
        }
    }, pluginID);
}

/**
 * Walk the full scraping chain for one site: known manga → chapters → pages → first image.
 * This is the regression coverage that would have caught the Comix "no images" bug
 * (mangas + chapters listed fine, but page fetching hung forever).
 */
async function FetchChapterFlow(args: FlowArgs): Promise<ChapterFlowResult> {
    const fixture = new PuppeteerFixture();
    const page = await fixture.GetPage();
    return page.evaluate(async (a: FlowArgs): Promise<ChapterFlowResult> => {
        const plugin = window.HakuNeko.PluginController.WebsitePlugins.find(website => website.Identifier === a.id);
        if(!plugin) {
            return { error: `Website plugin not found: ${a.id}` };
        }
        try {
            const manga = await plugin.TryGetEntry(a.mangaURL) as Manga;
            if(!manga) {
                return { error: `Manga not found: ${a.mangaURL}` };
            }
            await manga.Update();
            const chapters = manga.Entries.Value;
            const chapter = chapters.find(child => child.Identifier === a.chapterID);
            if(!chapter) {
                return { error: `Chapter not found: ${a.chapterID} (${chapters.length} available)` };
            }
            await chapter.Update();
            const pages = chapter.Entries.Value;
            if(pages.length === 0) {
                return { error: 'No pages found for chapter' };
            }
            // NOTE: 4 = Priority.Normal (const enum cannot be imported with isolatedModules)
            const blob = await pages[0].Fetch(4, new AbortController().signal);
            return {
                chapters: chapters.length,
                pages: pages.length,
                image: { ok: blob.size > 0, size: blob.size, type: blob.type },
            };
        } catch(error) {
            return { error: String(error instanceof Error ? error.message : error) };
        }
    }, args);
}

describe('Cloudflare-protected websites', () => {

    for(const pluginID of [ 'mangafire', 'comix', 'mangadrama' ]) {
        it(`should list mangas from '${pluginID}'`, { timeout: 240_000 }, async () => {
            const result = await ListMangas(pluginID);
            expect(result.error).toBeUndefined();
            expect(result.count).toBeGreaterThan(0);
        });
    }

    // Cloudflare never issues `cf_clearance` from flagged IPs, so the listing cannot complete.
    // Re-enable this case when running from a clean IP/VPN.
    it.skip(`should list mangas from 'crunchyscan'`, { timeout: 240_000 }, async () => {
        const result = await ListMangas('crunchyscan');
        expect(result.error).toBeUndefined();
        expect(result.count).toBeGreaterThan(0);
    });

    for(const args of [
        {
            id: 'mangafire',
            // NOTE: 'pvzy-vagabondd' (Vagabond) has been removed from MangaFire (404 "Not found" page) —
            // keep this URL pointing at an active title (verified 2026-08-16: 132 chapters).
            mangaURL: 'https://mangafire.to/title/gl3-gun-x-clover',
            chapterID: '156',
        },
        {
            id: 'comix',
            mangaURL: 'https://comix.to/title/k7yg7-the-spark-in-your-eyes',
            chapterID: '/title/k7yg7-the-spark-in-your-eyes/2536461-chapter-66',
        },
    ]) {
        it(`should scrape chapters, pages and an image from '${args.id}'`, { timeout: 240_000 }, async () => {
            const result = await FetchChapterFlow(args);
            expect(result.error).toBeUndefined();
            expect(result.chapters).toBeGreaterThan(0);
            expect(result.pages).toBeGreaterThan(0);
            expect(result.image?.ok).toBe(true);
            expect(result.image?.type).toMatch(/^image\//);
            expect(result.image?.size).toBeGreaterThan(0);
        });
    }
});
