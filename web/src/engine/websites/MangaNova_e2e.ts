import { describe, expect, it } from 'vitest';
import { PuppeteerFixture } from '../../../../test/PuppeteerFixture';
import { TestFixture } from '../../../test/WebsitesFixture';
import type { Chapter, Manga } from '../providers/MangaPlugin';

describe('Manga Nova listing', () => {
    it('lists mangas from the public catalogue', { timeout: 120_000 }, async () => {
        const fixture = new PuppeteerFixture();
        const page = await fixture.GetPage();
        const count = await page.evaluate(async () => {
            const plugin = window.HakuNeko.PluginController.WebsitePlugins.find(website => website.Identifier === 'manganova');
            if (!plugin) throw new Error('Manga Nova plugin not found');
            await plugin.Update();
            return plugin.Entries.Value.length;
        });
        expect(count).toBeGreaterThan(0);
    });

    it('extracts every page from a lazy-loaded chapter', { timeout: 120_000 }, async () => {
        const fixture = new PuppeteerFixture();
        const page = await fixture.GetPage();
        const result = await page.evaluate(async () => {
            const plugin = window.HakuNeko.PluginController.WebsitePlugins.find(website => website.Identifier === 'manganova');
            if (!plugin) throw new Error('Manga Nova plugin not found');
            const manga = await plugin.TryGetEntry('https://www.manga-nova.com/manga/mechanical-buddy-universe') as Manga;
            await manga.Update();
            const chapter = manga.Entries.Value.find(entry => entry.Identifier.endsWith('/chapitre/1')) as Chapter | undefined;
            if (!chapter) throw new Error('Manga Nova chapter 1 not found');
            await chapter.Update();
            return { pages: chapter.Entries.Value.length, first: chapter.Entries.Value[0]?.Link.href };
        });
        expect(result.pages).toBe(93);
        expect(result.first).toMatch(/cdn\.manga-nova\.com/);
    });
});

new TestFixture({
    plugin: {
        id: 'manganova',
        title: 'Manga Nova'
    },
    container: {
        url: 'https://www.manga-nova.com/manga/mechanical-buddy-universe',
        id: 'mechanical-buddy-universe',
        title: 'Mechanical Buddy Universe'
    },
    child: {
        id: '/lecture-en-ligne/mechanical-buddy-universe/chapitre/1',
        title: 'Chapitre 1'
    },
    entry: {
        index: 0,
        size: 154_381,
        type: 'image/jpeg'
    }
}).AssertWebsite();
