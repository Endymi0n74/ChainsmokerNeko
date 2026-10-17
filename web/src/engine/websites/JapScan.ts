import { Tags } from '../Tags';
import icon from './JapScan.webp';
import { DecoratableMangaScraper, type Manga, Chapter, Page, type MangaPlugin } from '../providers/MangaPlugin';
import * as Common from './decorators/Common';
import { AddAntiScrapingDetection, FetchRedirection } from '../platform/AntiScrapingDetection';
import { AddStalledChallengeReload } from '../platform/ChallengeReload';
import { ExtractPagesFromReader } from './JapScan.Extract';
import { DRMProvider } from './JapScan.DRM';
import { TaskPool, Priority } from '../taskpool/TaskPool';
import { RateLimit } from '../taskpool/RateLimit';

/**
 * Connecteur JapScan principal : approche « sans DRM ».
 *
 * Par rapport au connecteur de secours (`JapScanSecours.ts`), seule la lecture des pages
 * change : le lecteur est extrait du DOM (`JapScan.Extract.ts`) sans repli sur la fenêtre
 * DRM (`CreateImageLinks`). Catalogue, fiche et liste des chapitres restent identiques :
 * la liste des chapitres n'existe pas dans le HTML brut de la fiche manga (le site
 * l'injecte), elle passe donc par la fenêtre du fournisseur DRM (`CreateChapterList`).
 *
 * La détection anti-bot du site (`#jc-overlay`) et l'opt-in de rechargement de challenge
 * Cloudflare sont enregistrés ici pour la même origine : ils s'appliquent aussi à
 * `japscan-secours`.
 */

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
// Cloudflare's managed challenge on JapScan issues a fresh cf_clearance but never redirects
// the interstitial (the same stall documented for CrunchyScan in CLOUDFLARE.md §7): without
// the opt-in reload every extraction window pins on "Just a moment..." until its timeout.
// `AddStalledChallengeReload` also registers the fork challenge handling (it chains both).
AddStalledChallengeReload(/^https:\/\/(?:www\.)?japscan\.[a-z]{2,4}/);

@Common.ImageAjax(true)
export default class extends DecoratableMangaScraper {

    // JapScan présente un challenge interactif (#jc-overlay) qui exige une vraie
    // fenêtre visible — la vérification silencieuse saute donc ce site.
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
