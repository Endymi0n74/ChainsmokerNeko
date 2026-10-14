import { Tags } from '../Tags';
import icon from './JapScan.webp';
import { DecoratableMangaScraper, type Manga, Chapter, Page, type MangaPlugin } from '../providers/MangaPlugin';
import * as Common from './decorators/Common';
import { ExtractPagesFromReader } from './JapScan.Extract';
import { DRMProvider } from './JapScan.DRM';
import { TaskPool, Priority } from '../taskpool/TaskPool';
import { RateLimit } from '../taskpool/RateLimit';

/**
 * Simplified JapScan connector, registered next to the full one as a test variant.
 *
 * Kept: the interactive puzzle (`#jc-overlay`) is still handled, because the reader extraction
 * (`JapScan.Extract.ts`) waits for it inside the visible reader window. The anti-bot detection and
 * the Cloudflare stalled-challenge reload are registered by `JapScan.ts` for the same origin, so they
 * apply to this connector too.
 *
 * Removed: the DRM fallback window (`CreateImageLinks`), the listing pre-heat, the chapter cache and
 * the timeout / diagnostic bookkeeping of the connector itself.
 */
@Common.ImageAjax(true)
export default class extends DecoratableMangaScraper {

    // JapScan presents an interactive challenge that requires a real visible window.
    public override readonly RequiresVisibleBrowserWindow = true;

    readonly #drm = new DRMProvider();
    private readonly chaptersTaskPool = new TaskPool(1, new RateLimit(4, 1));

    public override ValidateMangaURL(url: string): boolean {
        try {
            const u = new URL(url);
            if (!/((www\.)?japscan\.)[a-z]{2,4}/.test(u.hostname)) return false;
            const p = u.pathname.split('/').filter(Boolean);
            return p.length >= 2 && ['manga', 'manhwa', 'bd'].includes(p[0]);
        } catch {
            return false;
        }
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
        super('japscan-lite', 'JapScan (test)', 'https://www.japscan.foo', Tags.Media.Manga, Tags.Media.Manhwa, Tags.Media.Manhua, Tags.Language.French, Tags.Source.Aggregator);
    }

    public override get Icon(): string {
        return icon;
    }

    public override Initialize(): Promise<void> {
        return this.#drm.Initialize(this.URI);
    }

    public override async FetchMangas(provider: MangaPlugin): Promise<Manga[]> {
        return [
            ... await Common.FetchMangasMultiPageCSS.call(this, provider, 'div.mangas-list div.manga-block a', Common.PatternLinkGenerator('/mangas/?p={page}', 1, 1, 500), 2500),
            ... await Common.FetchMangasMultiPageCSS.call(this, provider, 'div.mangas-list div.manga-block a', Common.PatternLinkGenerator('/bds/?p={page}', 1, 1, 500), 2500),
        ];
    }

    public override async FetchChapters(manga: Manga): Promise<Chapter[]> {
        return this.chaptersTaskPool.Add(async () => {
            const data = await this.#drm.CreateChapterList(new URL(manga.Identifier, this.URI));
            return data.map(({ id, title }) => new Chapter(this, manga, id, title));
        }, Priority.Normal);
    }

    public override async FetchPages(chapter: Chapter): Promise<Page[]> {
        const referer = new URL(chapter.Identifier, this.URI).href;
        // The visible reader window waits for the puzzle, then collects the pages.
        const { links } = await ExtractPagesFromReader(referer);
        return links.map(link => new Page(this, chapter, new URL(link), { Referer: referer }));
    }
}
