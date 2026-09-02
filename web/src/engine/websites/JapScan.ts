import { Tags } from '../Tags';
import icon from './JapScan.webp';
import { DecoratableMangaScraper, type Manga, Chapter, Page, type MangaPlugin } from '../providers/MangaPlugin';
import * as Common from './decorators/Common';
import { AddAntiScrapingDetection, FetchRedirection } from '../platform/AntiScrapingDetection';
import { AddForkChallengeHandling } from '../platform/ChallengeReload';
import { ExtractPagesFromReader } from './JapScan.Extract';
import { DRMProvider } from './JapScan.DRM';
import { TaskPool, Priority } from '../taskpool/TaskPool';
import { RateLimit } from '../taskpool/RateLimit';
import { FetchWindowScript } from '../platform/FetchProvider';

AddAntiScrapingDetection(async invoke => {
    // JapScan's own anti-bot (the "Glisse pour remettre dans l'ordre" puzzle) is announced by
    // `window.__captcha.needed === true` BEFORE its `#jc-overlay` node is rendered. Detect both so
    // the reader window is shown and the user can solve it; otherwise the page stays locked.
    const result = await invoke<boolean>(`!!document.querySelector('#jc-overlay') || (window.__captcha && window.__captcha.needed === true) || false;`);
    return result ? FetchRedirection.Interactive : undefined;
}, /^https:\/\/(?:www\.)?japscan\.[a-z]{2,4}/);
AddForkChallengeHandling(/^https:\/\/(?:www\.)?japscan\.[a-z]{2,4}/);

export const MIN_READER_PAGES_FOR_COMPLETE_RESULT = 5;

export function ShouldCompleteWithDRM(pageLinks: string[]): boolean {
    return pageLinks.length < MIN_READER_PAGES_FOR_COMPLETE_RESULT;
}

/** Prefer the DRM order, while retaining reader-only links discovered by scrolling. */
export function MergePageLinks(primary: string[], supplemental: string[]): string[] {
    return [...new Set([...primary, ...supplemental])];
}

@Common.ImageAjax(true)
export default class extends DecoratableMangaScraper {

    // JapScan presents an interactive challenge (#jc-overlay) that requires a
    // real visible window — silent verification therefore skips this site.
    public override readonly RequiresVisibleBrowserWindow = true;

    readonly #drm = new DRMProvider();
    private readonly chaptersTaskPool = new TaskPool(1, new RateLimit(4, 1));
    // Cache chapter lists to avoid re-opening browser windows on every refresh
    readonly #chapterCache = new Map<string, { chapters: Chapter[]; ts: number }>();
    readonly #CACHE_TTL = 3600_000; // 1 hour

    public override ValidateMangaURL(url: string): boolean {
        try {
            const u = new URL(url);
            const h = u.hostname;
            if (!/((www\.)?japscan\.)[a-z]{2,4}/.test(h)) return false;
            const p = u.pathname.split('/').filter(Boolean);
            return p.length >= 2 && ['manga', 'manhwa', 'bd'].includes(p[0]);
        } catch { return false; }
    }

    public override async FetchManga(provider: MangaPlugin, url: string): Promise<Manga> {
        const uri = new URL(url);
        const p = uri.pathname.split('/').filter(Boolean);
        const np = p.length >= 2 ? '/' + p[0] + '/' + p[1] + '/' : uri.pathname;
        const nu = new URL(np, uri.origin);
        return Common.FetchMangaCSS.call(this, provider, nu.href, '#main div.card-body h1', (head: HTMLHeadingElement | null) => ({
            id: np,
            title: head?.innerText?.replace(/man[gh][wu]?a\s+/i, '')?.trim() ?? ''
        }));
    }

    public constructor() {
        super('japscan', 'JapScan', 'https://www.japscan.foo', Tags.Media.Manga, Tags.Media.Manhwa, Tags.Media.Manhua, Tags.Language.French, Tags.Source.Aggregator);
    }

    public override get Icon(): string {
        return icon;
    }

    public override Initialize(): Promise<void> {
        return this.#drm.Initialize(this.URI);
    }

    public override async FetchMangas(provider: MangaPlugin): Promise<Manga[]> {
        // Pre-heat: the /mangas/ listing path triggers an interactive Cloudflare
        // challenge that background renewal alone cannot solve. Open it in a real
        // browser window so the challenge is resolved (auto or user), then the
        // shared session cookies allow the paginated HTTP requests to go through.
        try {
            await FetchWindowScript(
                new Request(new URL('/mangas/?p=1', this.URI)),
                'true', // dummy script — we only need the page to load & clear
                2_000, // poll interval
                300_000, // 5 min budget for interactive solve
                true // visible window (RequiresVisibleBrowserWindow)
            );
        } catch {
            // If the window times out or the user closes it, try anyway —
            // FetchMangasMultiPageCSS will either reuse stale cookies or fail
            // with the same error as before.
        }

        return [
            ... await Common.FetchMangasMultiPageCSS.call(this, provider, 'div.mangas-list div.manga-block a', Common.PatternLinkGenerator('/mangas/?p={page}', 1, 1, 500), 2500),
            ... await Common.FetchMangasMultiPageCSS.call(this, provider, 'div.mangas-list div.manga-block a', Common.PatternLinkGenerator('/bds/?p={page}', 1, 1, 500), 2500),
        ];
    }

    public override async FetchChapters(manga: Manga): Promise<Chapter[]> {
        const key = manga.Identifier;
        const cached = this.#chapterCache.get(key);
        if (cached && Date.now() - cached.ts < this.#CACHE_TTL) {
            return cached.chapters;
        }
        const chapters = await this.chaptersTaskPool.Add(async () => {
            const data = await this.#drm.CreateChapterList(new URL(manga.Identifier, this.URI));
            return data.map(({ id, title }) => new Chapter(this, manga, id, title));
        }, Priority.Normal);
        this.#chapterCache.set(key, { chapters, ts: Date.now() });
        return chapters;
    }

    public override async FetchPages(chapter: Chapter): Promise<Page[]> {
        const referer = new URL(chapter.Identifier, this.URI).href;
        const chapterURL = new URL(chapter.Identifier, this.URI);

        // Prefer the visible reader. The DRM extractor opens a second browser window and
        // can time out while the reader already has the pages, so use it to complete
        // suspiciously short reader results instead of treating them as successful.
        // (Parallel allSettled here was tried and reverted: the duplicate window re-triggers
        // the anti-bot puzzle and can deadlock both extractions.)
        const readerPages = await ExtractPagesFromReader(referer);
        let pages = readerPages;
        if (ShouldCompleteWithDRM(readerPages)) {
            try {
                pages = MergePageLinks(await this.#drm.CreateImageLinks(chapterURL), readerPages);
            } catch {
                pages = readerPages;
            }
        }
        return pages.map(link => new Page(this, chapter, new URL(link), { Referer: referer }));
    }
}
