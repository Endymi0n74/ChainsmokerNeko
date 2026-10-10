import { Tags } from '../Tags';
import icon from './JapScan.webp';
import { DecoratableMangaScraper, type Manga, Chapter, Page, type MangaPlugin } from '../providers/MangaPlugin';
import * as Common from './decorators/Common';
import { AddAntiScrapingDetection, FetchRedirection } from '../platform/AntiScrapingDetection';
import { SetChallengePolicy } from '../platform/ChallengePolicy';
import { ExtractPagesFromReader } from './JapScan.Extract';
import { DRMProvider } from './JapScan.DRM';
import { TaskPool, Priority } from '../taskpool/TaskPool';
import { RateLimit } from '../taskpool/RateLimit';
import { FetchWindowScript } from '../platform/FetchProvider';
import { RecordTimeout, EnterStage, LeaveStage } from '../TimeoutProbe';

/**
 * Budget of the DRM provider's own window (`DRMProvider.CreateImageLinks` / `CreateChapterList`):
 * the prebuilt module hardcodes 30 s, which expires against the async `captcha_d.js` puzzle —
 * documented in `FetchPages`. Mirrored here so the probe reports the value the caller waited for.
 */
export const DRM_WINDOW_BUDGET_MS = 30_000;

/**
 * JapScan's own anti-bot (the "Glisse pour remettre dans l'ordre" puzzle) is announced by
 * `window.__captcha.needed === true` BEFORE its `#jc-overlay` node is rendered, so both states
 * must be detected: otherwise the reader window is never shown and the page stays locked.
 *
 * The overlay node LINGERS in the DOM after the puzzle was solved (it is only hidden by CSS) —
 * documented in `JapScan.Extract.ts` and in CHANGELOG 3.0.3 ("the overlay can persist in the DOM
 * after resolution"). Testing mere existence therefore reported "challenge" forever:
 * `CheckAntiScrapingDetection` never returned `None`, so `cleared` never became true in
 * `PollForChallengeResolution` (it requires `antiScraping === None`), every window ended on a
 * 150 s timeout and the caller re-opened it — the visible "loop" when validating.
 *
 * Once the node exists its VISIBILITY is authoritative: falling through to `__captcha.needed`
 * would keep the classification stuck if that flag is not reset on solve, which is exactly the
 * loop being fixed here. The pre-render announcement still works because the node does not exist
 * yet at that point. `JapScan.Extract.ts` (`isBlocked`) keeps its own fall-through so the scroll
 * loop stays paused until the site declares itself done.
 */
export const JAPSCAN_CHALLENGE_DETECTION_SCRIPT = `
    (() => {
        try {
            const overlay = document.querySelector('#jc-overlay');
            let answer = false;
            let reason = '';
            if (overlay) {
                // Present: only a rendered overlay blocks. Once it is hidden by CSS the
                // puzzle was solved, whatever window.__captcha.needed still says.
                const style = window.getComputedStyle(overlay);
                answer = style.display !== 'none'
                    && style.visibility !== 'hidden'
                    && parseFloat(style.opacity) > 0
                    && overlay.offsetHeight > 0;
                reason = 'overlay:' + (answer ? 'visible' : 'hidden');
            } else {
                // Absent: the site may only be announcing the puzzle so far.
                answer = !!(window.__captcha && window.__captcha.needed === true);
                reason = 'captcha:' + (answer ? 'needed' : 'absent');
            }
            // Relayed into the host console by the [KUMO] prefix filter, next to the poll
            // trace: the trace reported site=Interactive while the widget probe saw neither
            // an overlay node nor a captcha flag in the same document, so the branch which
            // decided the classification has to name itself.
            try {
                console.warn('[KUMO] JapScanChallenge ' + reason + (answer ? ' -> Interactive' : ' -> None'));
            } catch (error) {
                // Diagnostics must never be able to break the detection itself.
            }
            return answer;
        } catch { return false; }
    })()
`;

AddAntiScrapingDetection(async invoke => {
    const result = await invoke<boolean>(JAPSCAN_CHALLENGE_DETECTION_SCRIPT);
    return result ? FetchRedirection.Interactive : undefined;
}, /^https:\/\/(?:www\.)?japscan\.[a-z]{2,4}/);
// JapScan's whole challenge policy, declared in ONE place (it used to be three registrations whose
// order decided the outcome — `AddStalledChallengeReload` chained the fork handling, then
// `AddClearanceReload` added the clearance path and its gate):
//
// - `forkHandling`: the fork window flow owns this site's windows (classification, budgets, pollers).
// - `stalledReload` + `requireSolveToken`: the age-driven stalled reload stays REGISTERED (the site
//   is one of the two that measured the managed stall) but is NOT allowed to run — it is
//   time-driven, so it may reload the very widget the user is validating: its probe cannot tell
//   "widget not mounted yet" from "probe missed the active control" (the reported `reload #1/3`
//   right after the 12 s grace). Only the token-gated clearance path may restart this site.
// - `clearanceReload`: Cloudflare issues a fresh `cf_clearance` for the interstitial and never
//   redirects it (measured: the request which got the cookie still serves the challenge, the first
//   reload leaves the interstitial, the second serves the reader). The poller therefore restarts
//   the SAME window, bounded at two reloads, then reports an explicit Cloudflare error.
// - `validationGrace` 60 s: JapScan rotates intermediate cookies while its validation POST is still
//   running, so the fallback F5 waits for the site's server-side validation; an 8 s reload lands
//   mid-validation and asks the user to solve another challenge.
// - `requireSolveToken`: the widget renders INLINE (`frames=child=0`, response field readable in the
//   parent document), so a `cf_clearance` change may only arm the reload cycle when the document's
//   own `[name="cf-turnstile-response"]` is completed — otherwise Cloudflare's render-time rotation
//   armed two reloads on a challenge nobody validated and the window died on `survived 2/2 reloads`
//   while the interactive budget still had a minute left to click.
SetChallengePolicy(/^https:\/\/(?:www\.)?japscan\.[a-z]{2,4}/, {
    forkHandling: true,
    stalledReload: true,
    clearanceReload: true,
    validationGrace: 60_000,
    requireSolveToken: true,
});

export const MIN_READER_PAGES_FOR_COMPLETE_RESULT = 5;

export function ShouldCompleteWithDRM(pageLinks: string[]): boolean {
    return pageLinks.length < MIN_READER_PAGES_FOR_COMPLETE_RESULT;
}

/** The reader returned fewer pages than its own page indicator announced. */
export function IsIncompleteReaderResult(links: string[], total?: number): boolean {
    return typeof total === 'number' && links.length < total;
}

/** A whole-book chapter: identifier or title mentions "volume". */
export function IsVolumeChapter(chapter: Pick<Chapter, 'Identifier' | 'Title'>): boolean {
    return /volume/i.test(`${chapter.Identifier} ${chapter.Title}`);
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
            const listURL = new URL(manga.Identifier, this.URI);
            const startedAt = Date.now();
            try {
                const data = await this.#drm.CreateChapterList(listURL);
                return data.map(({ id, title }) => new Chapter(this, manga, id, title));
            } catch (error) {
                // The chapter list goes through the DRM window as well: without this line a
                // failure there was only visible as a generic error in the media list.
                RecordTimeout({ stage: 'chapter-list', label: 'DRMProvider.CreateChapterList', budgetMs: DRM_WINDOW_BUDGET_MS, elapsedMs: Date.now() - startedAt, error, url: listURL.href });
                throw error;
            }
        }, Priority.Normal);
        // An extraction which ran against a still-challenged document comes back empty: caching
        // it would pin "0 items" for the whole TTL without a single retry in between.
        if (chapters.length > 0) {
            this.#chapterCache.set(key, { chapters, ts: Date.now() });
        }
        return chapters;
    }

    public override async FetchPages(chapter: Chapter): Promise<Page[]> {
        const referer = new URL(chapter.Identifier, this.URI).href;
        const chapterURL = new URL(chapter.Identifier, this.URI);
        // The visible reader window (5-minute budget) is the only context where the
        // interactive anti-bot puzzle can be solved in place. The extraction runs the
        // site DRM bootstrap inside that same window, so volume chapters deliver their
        // full page list from the page's own protected payload once unlocked — no
        // second DRM window needed (its hardcoded 30s budget always times out against
        // the async `captcha_d.js` puzzle, see DRMProvider.CreateImageLinks).
        const extraction = await ExtractPagesFromReader(referer);
        const readerPages = extraction.links;
        console.log(`[JapScan] ${chapter.Identifier} -> ${readerPages.length} pages (drm: ${extraction.drm ?? 0}, dom: ${extraction.dom ?? 0}, selector: ${extraction.selector ?? 0}, probe: ${extraction.probe ?? 0}, total: ${extraction.total ?? 'none'}) puzzle: ${extraction.puzzle ?? 0}s, drain: ${extraction.drain ?? 0}s, walk: ${extraction.walk ?? 0}s, scroll: ${extraction.scroll ?? 0}s`);
        // DOM-level reader diagnostics (JSON) ride back in the extraction result — the
        // reader window's own console output is not visible to the host process, so the
        // host logs them here (see JapScan.Extract.ts GatherReaderDiagnostics).
        if (extraction.diag) console.log(`[JapScan] reader diag ${extraction.diag}`);
        let pages = readerPages;
        if (ShouldCompleteWithDRM(readerPages) || IsIncompleteReaderResult(readerPages, extraction.total)) {
            // Last resort: the reader under-delivered and carried no DRM payload.
            // Query the DRM provider directly; its window may still time out on the
            // anti-bot, in which case the reader's partial result is kept.
            const drmStarted = Date.now();
            EnterStage('drm-pages', `url=${chapterURL.href}`);
            try {
                pages = MergePageLinks(await this.#drm.CreateImageLinks(chapterURL), readerPages);
                LeaveStage('drm-pages', `merged ${pages.length} page(s) in ${Date.now() - drmStarted}ms`);
            } catch (error) {
                // Swallowed before: a DRM window which burned its 30 s looked like a chapter
                // with a handful of pages, with nothing in the log to tell the two apart.
                RecordTimeout({ stage: 'drm-pages', label: 'DRMProvider.CreateImageLinks', budgetMs: DRM_WINDOW_BUDGET_MS, elapsedMs: Date.now() - drmStarted, error, url: chapterURL.href, detail: `kept ${readerPages.length} reader page(s)` });
                pages = readerPages;
            }
        }
        return pages.map(link => new Page(this, chapter, new URL(link), { Referer: referer }));
    }
}
