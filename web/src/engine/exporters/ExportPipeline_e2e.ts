import { describe, expect, it } from 'vitest';
import { PuppeteerFixture } from '../../../../test/PuppeteerFixture';

// Minimal valid 1x1 PNG — enough for the exporters to treat the blob as a real
// image without network access or decoding.
const TinyPNGBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/**
 * Replaces real site scraping with synthetic, offline data on the first plugin
 * in the registry and points the media directory at the browser's OPFS, so the
 * whole pipeline (plugin → manga → chapter → pages → download → export) runs
 * without any network. Idempotent — safe to re-inject before each test.
 */
const SetupSyntheticPlugin = `
    (async () => {
        const plugin = window.HakuNeko.PluginController.WebsitePlugins.find(p => p && p.Identifier);
        if (!plugin) throw new Error('No website plugin found');
        const scraper = plugin['scraper'];
        const png = Uint8Array.from(atob('${TinyPNGBase64}'), c => c.charCodeAt(0));
        scraper['Initialize'] = async () => {};
        scraper['FetchChapters'] = async () => [];
        scraper['FetchMangas'] = async () => [];
        scraper['FetchPages'] = async () => Array.from({ length: 3 }, () => ({
            Fetch: async () => new Blob([ png ], { type: 'image/png' }),
        }));
        const settings = window.HakuNeko.SettingsManager.OpenScope();
        settings.Get('media-directory').Value = await navigator.storage.getDirectory();
        settings.Get('website-subdirectory').Value = false;
        settings.Get('pdf-theme').Value = 'dark';
        settings.Get('pdf-double-page').Value = true;
        return plugin.Identifier;
    })()
` as unknown as any;

/**
 * Downloads a single chapter (created on the synthetic plugin) with the given
 * export format and waits for its task to settle. Returns the task outcome.
 */
const DownloadChapter = `
    (async ({ chapterId, chapterTitle, format }) => {
        const plugin = window.HakuNeko.PluginController.WebsitePlugins.find(p => p && p.Identifier);
        const manga = plugin.CreateEntry('/mock-manga', 'Mock Manga');
        const chapter = manga.CreateEntry(chapterId, chapterTitle);
        const settings = window.HakuNeko.SettingsManager.OpenScope();
        settings.Get('manga-export-format').Value = format;
        await window.HakuNeko.DownloadManager.Enqueue(chapter);
        const deadline = Date.now() + 90_000;
        while (Date.now() < deadline) {
            const task = window.HakuNeko.DownloadManager.Queue.Value.find(t => t.Media && t.Media.Identifier === chapter.Identifier);
            if (task && [ 'completed', 'failed' ].includes(task.Status.Value)) {
                return {
                    completed: task.Status.Value === 'completed',
                    failed: task.Status.Value === 'failed',
                    errors: (task.Errors?.Value ?? []).map(e => e?.message ?? String(e)),
                };
            }
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        return { completed: false, failed: true, errors: [ 'timeout waiting for task' ] };
    })
` as unknown as any;

/**
 * Reads a file out of the (OPFS-backed) media directory, under the "Mock Manga"
 * folder, and returns its size + whether it is a valid ZIP (PK local header).
 */
const ReadExportFile = `
    (async (fileName) => {
        const dir = await navigator.storage.getDirectory();
        const mangaDir = await dir.getDirectoryHandle('Mock Manga');
        const handle = await mangaDir.getFileHandle(fileName);
        const file = await handle.getFile();
        const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
        const prefixOk = String.fromCharCode(head[0], head[1], head[2], head[3]) === 'PK\\x03\\x04';
        return { size: file.size, prefixOk, fileType: file.type };
    })
` as unknown as any;

describe('Chapter download & export pipeline (offline)', () => {

    it('boots a synthetic plugin and points the media directory at OPFS', { timeout: 120_000 }, async () => {
        const fixture = new PuppeteerFixture();
        const page = await fixture.GetPage();
        await page.evaluate(SetupSyntheticPlugin);
        const ok = await page.evaluate(async () => {
            const settings = window.HakuNeko.SettingsManager.OpenScope();
            return !!settings.Get('media-directory').Value;
        });
        expect(ok).toBe(true);
    });

    it('downloads pages and exports them as a streaming CBZ', { timeout: 180_000 }, async () => {
        const fixture = new PuppeteerFixture();
        const page = await fixture.GetPage();
        await page.evaluate(SetupSyntheticPlugin);
        const result = await page.evaluate(`(${DownloadChapter})({ chapterId: '/mock-ch-1', chapterTitle: 'Mock Chapter 1', format: 'application/x-cbz' })`);
        if ((result as any).failed) {
            throw new Error('Chapter export failed: ' + JSON.stringify((result as any).errors));
        }
        expect((result as any).completed).toBe(true);
        const file = await page.evaluate(`(${ReadExportFile})('Mock Chapter 1.cbz')`);
        expect((file as any).prefixOk).toBe(true);
        expect((file as any).size).toBeGreaterThan(0);
    });

    it('merges several chapters into a single omnibus CBZ volume', { timeout: 240_000 }, async () => {
        const fixture = new PuppeteerFixture();
        const page = await fixture.GetPage();
        await page.evaluate(SetupSyntheticPlugin);
        const result = await page.evaluate(`(async () => {
            const plugin = window.HakuNeko.PluginController.WebsitePlugins.find(p => p && p.Identifier);
            const manga = plugin.CreateEntry('/mock-manga', 'Mock Manga');
            const ch1 = manga.CreateEntry('/ch-1', 'Mock Chapter 1');
            const ch2 = manga.CreateEntry('/ch-2', 'Mock Chapter 2');
            const settings = window.HakuNeko.SettingsManager.OpenScope();
            settings.Get('manga-export-format').Value = 'application/x-cbz';
            await window.HakuNeko.DownloadManager.EnqueueCollection([ ch1, ch2 ], 'Omnibus');
            const deadline = Date.now() + 150_000;
            while (Date.now() < deadline) {
                const task = window.HakuNeko.DownloadManager.Queue.Value.find(t => t.Media && t.Media.Title === 'Omnibus');
                if (task && [ 'completed', 'failed' ].includes(task.Status.Value)) {
                    return {
                        completed: task.Status.Value === 'completed',
                        failed: task.Status.Value === 'failed',
                        errors: (task.Errors?.Value ?? []).map(e => e?.message ?? String(e)),
                    };
                }
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            return { completed: false, failed: true, errors: [ 'timeout waiting for omnibus task' ] };
        })()`);
        if ((result as any).failed) {
            throw new Error('Omnibus export failed: ' + JSON.stringify((result as any).errors));
        }
        expect((result as any).completed).toBe(true);
        const file = await page.evaluate(`(${ReadExportFile})('Mock Manga - Omnibus.cbz')`);
        expect((file as any).prefixOk).toBe(true);
        expect((file as any).size).toBeGreaterThan(0);
    });
});