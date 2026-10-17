import { Tags } from '../Tags';
import icon from './JapScan.webp';
import { Chapter, DecoratableMangaScraper, Manga, Page, type MangaPlugin } from '../providers/MangaPlugin';
import * as Common from './decorators/Common';
import { AddAntiScrapingDetection, FetchRedirection } from '../platform/AntiScrapingDetection';
import { AddStalledChallengeReload } from '../platform/ChallengeReload';
import { FetchWindowScript } from '../platform/FetchProvider';

/**
 * Connecteur JapScan principal : approche « sans DRM ».
 *
 * Chaque étape ouvre une fenêtre et laisse le script injecté lire le DOM ; l'extraction
 * des pages passe par le sélecteur de pages du lecteur (`select#pages`) quand le DOM ne
 * suffit pas. Le connecteur DRM/lecteur reste disponible en secours sous `japscan-secours`.
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

// Domaine par défaut. JapScan change souvent de domaine : Initialize() suit
// automatiquement la redirection, mais mets à jour cette valeur si besoin.
const defaultOrigin = 'https://www.japscan.foo';

// Pause entre deux ouvertures de fenêtre, pour ne pas déclencher un nouveau challenge.
const windowCooldown = 1500;

// Durée maximale pendant laquelle un script attend passivement la fin du challenge.
const challengeWait = 45_000;

type Entry = {
    id: string;
    title: string;
};

type WindowResult<T extends JSONElement> = {
    challenge: boolean;
    data: T;
};

function Sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * File d'attente globale : une seule fenêtre JapScan est ouverte à la fois.
 * Plusieurs fenêtres en parallèle lancent chacune leur propre challenge.
 * Chaque validation remplace alors le cookie cf_clearance des autres,
 * ce qui provoque la boucle « Vérification... » sans fin.
 */
class WindowQueue {
    private tail: Promise<unknown> = Promise.resolve();

    public Run<T>(task: () => Promise<T>): Promise<T> {
        const result = this.tail.then(task, task);
        this.tail = result.catch(() => undefined);
        return result;
    }
}

const queue = new WindowQueue();

// Détection du challenge Cloudflare. Ce code ne touche jamais la page :
// aucun clic, aucun défilement, aucune requête pendant la vérification.
const challengeDetector = [
    'function wait(ms) { return new Promise(done => setTimeout(done, ms)); }',
    'function isChallenge() {',
    '    const title = (document.title || "").toLowerCase();',
    '    if (/just a moment|un instant|attention required|checking your browser/.test(title)) return true;',
    '    return !!document.querySelector("#challenge-form, #challenge-running, #challenge-stage, #challenge-body-text, #cf-challenge-running");',
    '}'
].join('\n');

/**
 * Enveloppe un script. Tant que le challenge est affiché, on attend sans rien faire.
 * Le script de collecte ne s'exécute que sur la vraie page JapScan.
 */
function Wrap(body: string): string {
    return [
        'new Promise(async (resolve, reject) => {',
        challengeDetector,
        '    const deadline = Date.now() + ' + challengeWait + ';',
        '    while (isChallenge()) {',
        '        if (Date.now() > deadline) return resolve({ challenge: true, data: null });',
        '        await wait(500);',
        '    }',
        '    try {',
        '        const data = await (async () => {',
        body,
        '        })();',
        '        resolve({ challenge: false, data: data });',
        '    } catch (error) {',
        '        reject(error);',
        '    }',
        '});'
    ].join('\n');
}

// Liste des mangas d'une page de l'annuaire.
const mangasBody = [
    'const started = Date.now();',
    'const pattern = /^\\/(manga|manhwa|manhua|bd|comics?)\\/[^/]+\\/?$/i;',
    'function visible(el) {',
    '    const style = window.getComputedStyle(el);',
    '    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";',
    '}',
    'function collect() {',
    '    const map = new Map();',
    '    const scope = document.querySelector("#mangas_content, div.mangas_list, #main") || document.body;',
    '    for (const a of scope.querySelectorAll("a[href]")) {',
    '        let url;',
    '        try { url = new URL(a.getAttribute("href"), window.location.origin); } catch (e) { continue; }',
    '        if (url.origin !== window.location.origin || !pattern.test(url.pathname) || !visible(a)) continue;',
    '        const id = url.pathname.endsWith("/") ? url.pathname : url.pathname + "/";',
    '        const title = (a.textContent || a.getAttribute("title") || "").replace(/\\s+/g, " ").trim();',
    '        if (!title) { if (!map.has(id)) map.set(id, ""); continue; }',
    '        if (!map.get(id)) map.set(id, title);',
    '    }',
    '    return [...map.entries()].filter(([, title]) => title).map(([id, title]) => ({ id, title }));',
    '}',
    'while (Date.now() - started < 8000) {',
    '    const result = collect();',
    '    if (result.length > 0) return result;',
    '    await wait(250);',
    '}',
    'return collect();'
].join('\n');

// Titre et identifiant d'un manga.
const mangaBody = [
    'const started = Date.now();',
    'function clean(text) {',
    '    return (text || "")',
    '        .replace(/\\s+/g, " ")',
    '        .replace(/^\\s*(Lecture en ligne|Lire)\\s+/i, "")',
    '        .replace(/\\s+(Scans?|VF|Manga|Manhwa|Manhua)\\s*$/i, "")',
    '        .trim();',
    '}',
    'function read() {',
    '    const heading = document.querySelector("div#main div.card-body h1, div#main h1, h1");',
    '    let title = clean(heading ? heading.textContent : "");',
    '    if (!title) {',
    '        const meta = document.querySelector("meta[property=\'og:title\']");',
    '        title = clean(meta ? meta.getAttribute("content") : document.title.split("|")[0]);',
    '    }',
    '    return title;',
    '}',
    'let title = read();',
    'while (!title && Date.now() - started < 8000) {',
    '    await wait(250);',
    '    title = read();',
    '}',
    'const path = window.location.pathname;',
    'return { id: path.endsWith("/") ? path : path + "/", title: title || path };'
].join('\n');

// Liste des chapitres. Les liens leurres cachés sont ignorés.
const chaptersBody = [
    'const started = Date.now();',
    'function visible(el) {',
    '    let node = el;',
    '    while (node && node !== document.body) {',
    '        const style = window.getComputedStyle(node);',
    '        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;',
    '        node = node.parentElement;',
    '    }',
    '    return true;',
    '}',
    'function collect() {',
    '    const selector = [',
    '        "#list_chapters a[href*=\'/lecture-en-ligne/\']",',
    '        "#chapters_list a[href*=\'/lecture-en-ligne/\']",',
    '        ".chapters_list a[href*=\'/lecture-en-ligne/\']",',
    '        "#main a[href*=\'/lecture-en-ligne/\']"',
    '    ].join(", ");',
    '    const map = new Map();',
    '    for (const a of document.querySelectorAll(selector)) {',
    '        if (!visible(a)) continue;',
    '        let url;',
    '        try { url = new URL(a.getAttribute("href"), window.location.origin); } catch (e) { continue; }',
    '        if (url.origin !== window.location.origin) continue;',
    '        const id = url.pathname.endsWith("/") ? url.pathname : url.pathname + "/";',
    '        if (map.has(id)) continue;',
    '        const title = (a.textContent || a.getAttribute("title") || "").replace(/\\s+/g, " ").trim();',
    '        map.set(id, title || id.split("/").filter(Boolean).pop());',
    '    }',
    '    return [...map.entries()].map(([id, title]) => ({ id, title }));',
    '}',
    'while (Date.now() - started < 10000) {',
    '    const result = collect();',
    '    if (result.length > 0) return result;',
    '    await wait(300);',
    '}',
    'return collect();'
].join('\n');

// Images du lecteur. Les requêtes internes sont lentes et séquentielles.
// Elles s'arrêtent dès qu'une réponse ressemble à un challenge, pour ne pas en déclencher un nouveau.
const pagesBody = [
    'const imagePattern = /\\.(jpe?g|png|webp|gif|avif)(\\?.*)?$/i;',
    'const blacklist = /(logo|banner|avatar|icon|pub|ads?)[^/]*$/i;',
    'function absolute(value, base) {',
    '    if (!value) return null;',
    '    try { return new URL(value.trim(), base || window.location.href).href; } catch (e) { return null; }',
    '}',
    'function accept(url) {',
    '    if (!url || url.startsWith("data:") || url.startsWith("blob:")) return false;',
    '    try {',
    '        const path = new URL(url).pathname;',
    '        return imagePattern.test(path) && !blacklist.test(path);',
    '    } catch (e) { return false; }',
    '}',
    'function unique(list) {',
    '    return [...new Set(list.filter(accept))];',
    '}',
    'function fromDocument(doc, base) {',
    '    const list = [];',
    '    for (const el of doc.querySelectorAll("[data-img]")) list.push(absolute(el.getAttribute("data-img"), base));',
    '    for (const el of doc.querySelectorAll("#image[data-src], #single-reader [data-src], #full-reader [data-src]")) {',
    '        list.push(absolute(el.getAttribute("data-src"), base));',
    '    }',
    '    for (const img of doc.querySelectorAll("#single-reader img, #full-reader img, #image img, div.reader img")) {',
    '        list.push(absolute(img.getAttribute("data-src") || img.getAttribute("src"), base));',
    '    }',
    '    return unique(list);',
    '}',
    'function looksLikeChallenge(status, html) {',
    '    if (status === 403 || status === 429 || status === 503) return true;',
    '    return /challenge-form|challenge-platform\\/h\\/|Just a moment|cf-chl-/i.test(html.slice(0, 20000));',
    '}',
    '',
    'const started = Date.now();',
    'let images = [];',
    'while (Date.now() - started < 10000) {',
    '    images = fromDocument(document);',
    '    if (images.length > 0) break;',
    '    await wait(300);',
    '}',
    '',
    'const options = [...document.querySelectorAll("select#pages option, select[name=\'pages\'] option")];',
    'if (options.length > 1 && images.length < options.length) {',
    '    const collected = [];',
    '    for (const option of options) {',
    '        const direct = absolute(option.getAttribute("data-img"));',
    '        if (accept(direct)) { collected.push(direct); continue; }',
    '        const pageURL = absolute(option.getAttribute("value"));',
    '        if (!pageURL || pageURL === window.location.href) continue;',
    '        try {',
    '            const response = await fetch(pageURL, { credentials: "include", referrer: window.location.href });',
    '            const html = await response.text();',
    '            if (looksLikeChallenge(response.status, html)) break;',
    '            const doc = new DOMParser().parseFromString(html, "text/html");',
    '            const found = fromDocument(doc, pageURL);',
    '            if (found.length > 0) collected.push(found[0]);',
    '        } catch (e) { break; }',
    '        await wait(400);',
    '    }',
    '    const merged = unique(images.concat(collected));',
    '    if (merged.length > images.length) images = merged;',
    '}',
    '',
    'if (images.length === 0) {',
    '    window.scrollTo(0, document.body.scrollHeight);',
    '    await wait(2000);',
    '    images = fromDocument(document);',
    '}',
    '',
    'if (images.length === 0) throw new Error("JapScan : aucune image trouvée dans le lecteur.");',
    'return images;'
].join('\n');

@Common.ImageAjax(true)
export default class extends DecoratableMangaScraper {

    // JapScan présente un challenge interactif (#jc-overlay) qui exige une vraie
    // fenêtre visible — la vérification silencieuse saute donc ce site.
    public override readonly RequiresVisibleBrowserWindow = true;

    public constructor() {
        super('japscan', 'JapScan', defaultOrigin, Tags.Media.Manga, Tags.Media.Manhwa, Tags.Media.Manhua, Tags.Language.French, Tags.Source.Aggregator);
    }

    public override get Icon() {
        return icon;
    }

    /**
     * Ouvre une seule fenêtre à la fois. Si le challenge n'est pas terminé dans le délai,
     * une seule nouvelle tentative a lieu. Elle réutilise le cookie obtenu à la première validation.
     */
    private async Navigate<T extends JSONElement>(url: URL | string, body: string, delay: number, timeout: number): Promise<T> {
        return queue.Run(async () => {
            let lastError: unknown = null;
            for (let attempt = 1; attempt <= 2; attempt++) {
                try {
                    const result = await FetchWindowScript<WindowResult<T>>(new Request(url.toString()), Wrap(body), delay, timeout);
                    if (result && !result.challenge) {
                        await Sleep(windowCooldown);
                        return result.data;
                    }
                } catch (error) {
                    lastError = error;
                }
                await Sleep(3000);
            }
            if (lastError instanceof Error && !/challenge|cloudflare|timeout|timed out/i.test(lastError.message)) {
                throw lastError;
            }
            throw new Error('JapScan : la vérification Cloudflare n\'a pas abouti. Valide-la une fois dans la fenêtre qui s\'ouvre, puis relance le chapitre.');
        });
    }

    public override async Initialize(): Promise<void> {
        // Passe le challenge une fois sur l'accueil et suit la redirection vers le domaine actuel.
        // Le cookie cf_clearance obtenu sert ensuite aux chapitres.
        const origin = await this.Navigate<string>(this.URI, 'return window.location.origin;', 2500, 90_000);
        if (origin && /^https?:\/\//.test(origin)) {
            this.URI.href = origin;
        }
    }

    public override ValidateMangaURL(url: string): boolean {
        return /^https?:\/\/(www\.)?japscan\.[a-z]+\/(manga|manhwa|manhua|bd|comics?)\/[^/]+\/?$/i.test(url);
    }

    public override async FetchManga(provider: MangaPlugin, url: string): Promise<Manga> {
        const entry = await this.Navigate<Entry>(url, mangaBody, 1500, 90_000);
        return new Manga(this, provider, entry.id, entry.title);
    }

    public override async FetchMangas(provider: MangaPlugin): Promise<Manga[]> {
        const mangas = new Map<string, Manga>();
        for (let page = 1, maxPages = 1000; page <= maxPages; page++) {
            let entries: Entry[] = [];
            try {
                entries = await this.Navigate<Entry[]>(new URL('/mangas/' + page + '/', this.URI), mangasBody, 1000, 90_000);
            } catch {
                break;
            }
            const before = mangas.size;
            for (const entry of entries ?? []) {
                if (!mangas.has(entry.id)) {
                    mangas.set(entry.id, new Manga(this, provider, entry.id, entry.title));
                }
            }
            if (!entries || entries.length === 0 || mangas.size === before) {
                break;
            }
        }
        return [...mangas.values()];
    }

    public override async FetchChapters(manga: Manga): Promise<Chapter[]> {
        const entries = await this.Navigate<Entry[]>(new URL(manga.Identifier, this.URI), chaptersBody, 1500, 90_000);
        return (entries ?? []).map(entry => {
            const title = entry.title.replace(manga.Title, '').replace(/\s+/g, ' ').trim() || entry.title;
            return new Chapter(this, manga, entry.id, title);
        });
    }

    public override async FetchPages(chapter: Chapter): Promise<Page[]> {
        const chapterURL = new URL(chapter.Identifier, this.URI);
        const images = await this.Navigate<string[]>(chapterURL, pagesBody, 2000, 120_000);
        return images.map(image => new Page(this, chapter, new URL(image), { Referer: chapterURL.href }));
    }
}
