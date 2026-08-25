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

AddAntiScrapingDetection(async invoke => {
    // JapScan's own anti-bot (the "Glisse pour remettre dans l'ordre" puzzle) is announced by
    // `window.__captcha.needed === true` BEFORE its `#jc-overlay` node is rendered. Detect both so
    // the reader window is shown and the user can solve it; otherwise the page stays locked.
    const result = await invoke<boolean>(`!!document.querySelector('#jc-overlay') || (window.__captcha && window.__captcha.needed === true) || false;`);
    return result ? FetchRedirection.Interactive : undefined;
}, /^https:\/\/(?:www\.)?japscan\.[a-z]{2,4}/);
AddForkChallengeHandling(/^https:\/\/(?:www\.)?japscan\.[a-z]{2,4}/);

@Common.ImageAjax(true)
export default class extends DecoratableMangaScraper {

    // JapScan présente un challenge interactif (#jc-overlay) qui nécessite une
    // vraie fenêtre visible — la vérification silencieuse saute donc ce site.
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
        return [
            ... await Common.FetchMangasMultiPageCSS.call(this, provider, 'div.mangas-list div.manga-block a', Common.PatternLinkGenerator('/mangas/?p={page}'), 2500),
            ... await Common.FetchMangasMultiPageCSS.call(this, provider, 'div.mangas-list div.manga-block a', Common.PatternLinkGenerator('/bds/?p={page}'), 2500),
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

        // Primary path: scroll the visible reader and collect CDN image URLs.
        // Fallback: DRM hook when the reader extraction returns empty.
        let pages = await ExtractPagesFromReader(referer);
        if (!pages.length) {
            try {
                pages = await this.#drm.CreateImageLinks(chapterURL);
            } catch {
                // DRM hook failed — no pages available
            }
        }
        return pages.map(link => new Page(this, chapter, new URL(link), { Referer: referer }));
    }
}
