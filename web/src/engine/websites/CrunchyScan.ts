import { Tags } from '../Tags';
import icon from './CrunchyScan.webp';
import type { Priority } from '../taskpool/TaskPool';
import { RateLimit } from '../taskpool/RateLimit';
import { DecoratableMangaScraper, type Chapter, Page } from '../providers/MangaPlugin';
import * as Common from './decorators/Common';
import { AddAntiScrapingDetection, FetchRedirection } from '../platform/AntiScrapingDetection';
import { AddStalledChallengeReload } from '../platform/ChallengeReload';
import { FetchWindowScript } from '../platform/FetchProvider';
import { Delay, SetTimeout, ClearTimeout } from '../BackgroundTimers';

import { DRMProvider } from './CrunchyScan.DRM';

AddAntiScrapingDetection(async invoke => {
    const challenged = await invoke<boolean>(`
        (() => {
            const title = (document.title || '').trim().toLowerCase();
            const text = (document.body?.innerText || '').toLowerCase();
            return /just a moment|un instant|checking your browser/i.test(title)
                || /vérification de sécurité|verify you(?:'re| are)? human|vérifiez que vous êtes humain|checking if the site connection is secure/i.test(text);
        })()
    `);
    // CrunchyScan's current Turnstile is mounted in a subframe and is not reliably
    // visible from the parent DOM. Treating the text-only shell as Automatic leaves
    // the plugin waiting forever; an Interactive result opens the same validation
    // window that successfully primes the shared Cloudflare session.
    return challenged ? FetchRedirection.Interactive : undefined;
}, /^https:\/\/(?:www\.)?crunchyscan\.org/);
AddStalledChallengeReload(/^https:\/\/(?:www\.)?crunchyscan\.org/);

function CleanTitle(text: string) {
    return text.replace(/^\s*\(\s*adulte[^\)]*\)\s*/i, '');
}

function MangaLinkExtractor(head: HTMLHeadingElement, uri: URL) {
    return {
        id: uri.pathname,
        title: CleanTitle(head.innerText),
    };
}

@Common.MangaCSS(/^{origin}\/lecture-en-ligne\/[^/]+\/?$/, 'main.container .baseManga h2', MangaLinkExtractor)
@Common.MangasMultiPageCSS<HTMLAnchorElement>('a[class*="text"][href*="/lecture-en-ligne/"]', Common.PatternLinkGenerator('/api/getLastManga?method=grid&page={page}'), 0, a => ({ id: a.pathname, title: CleanTitle(a.text) }))
@Common.ChaptersSinglePageCSS('#ChapterWrap a.chapter-link[href*="/read/"]')
export default class extends DecoratableMangaScraper {

    readonly #drm = new DRMProvider();
    private initializePromise?: Promise<void>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private drmCache = new Map<string, Promise<any>>();

    public override readonly RequiresVisibleBrowserWindow = true;

    public constructor() {
        super('crunchyscan', 'Crunchyscan', 'https://crunchyscan.org', Tags.Media.Manhwa, Tags.Media.Manhua, Tags.Language.French, Tags.Source.Aggregator);
        this.imageTaskPool.RateLimit = new RateLimit(2, 1);
    }

    public override Initialize(): Promise<void> {
        // Multiple UI actions can initialize the same plugin concurrently. Share one
        // challenge promise so CrunchyScan never opens several Cloudflare windows at once.
        this.initializePromise ??= FetchWindowScript<void>(new Request(this.URI.href), '');
        return this.initializePromise;
    }

    public override get Icon(): string {
        return icon;
    }

    public async FetchPages(chapter: Chapter): Promise<Page[]> {
        // The DRM internally opens its own browser window via FetchWindowScript;
        // cache the result per chapter URL to avoid re-opening windows for
        // repeated fetches of the same chapter.
        const chapterUrl = new URL(chapter.Identifier, this.URI);
        const cacheKey = chapterUrl.href;
        let promise = this.drmCache.get(cacheKey);
        if (!promise) {
            promise = this.#drm.CreateImageLinks(chapterUrl).catch(err => {
                this.drmCache.delete(cacheKey);
                throw err;
            });
            this.drmCache.set(cacheKey, promise);
        }
        const data = await promise;
        return data.map(image => new Page(this, chapter, new URL(image.url, this.URI), { Referer: image.referer }));
    }

    public async FetchImage(page: Page, priority: Priority, signal: AbortSignal): Promise<Blob> {
        return this.imageTaskPool.Add(async () => {
            let lastError: unknown;
            for (let attempt = 0; attempt < 3; attempt++) {
                if (signal.aborted) throw new DOMException("Aborted", "AbortError");
                const attemptSignal = new AbortController();
                const onAbort = () => attemptSignal.abort();
                signal.addEventListener("abort", onAbort, { once: true });
                const timeout = await SetTimeout(() => attemptSignal.abort(), 30_000);
                try {
                    return await this.#drm.GetImageData(page.Link, page.Parameters.Referer, attemptSignal.signal);
                } catch (error) {
                    if (signal.aborted) throw error;
                    lastError = error;
                } finally {
                    ClearTimeout(timeout);
                    signal.removeEventListener("abort", onAbort);
                }
                if (attempt < 2) await Delay(1000 * (attempt + 1));
            }
            throw lastError instanceof Error ? lastError : new Error(String(lastError));
        }, priority, signal);
    }
}