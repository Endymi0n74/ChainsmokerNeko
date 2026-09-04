import { FetchWindowPreloadScript } from '../platform/FetchProvider';
import { BuildDRMPreload } from './JapScan.DRM.preload';

export type OrderedPageLink = {
    link: string;
    order: number;
    discovery: number;
};

export type ReaderExtraction = {
    /** Deduplicated reader image URLs, ordered by DOM position. */
    links: string[];
    /** Total announced by the reader's own page indicator, when detected. */
    total?: number;
    /** Number of pages delivered by the site DRM payload, when it decoded. */
    drm?: number;
    /** Pages discovered by DOM scraping (lazy-load drain + scroll) before the page-selector walk. */
    dom?: number;
    /** New pages recovered by walking the page-selector's per-page URLs. */
    selector?: number;
    /** Pages recovered from the URL-construction probe's img-assigned list (full
     * volume list the lazy-loader never mounts), beyond what the DOM delivered. */
    probe?: number;
    /** Wall time spent blocked on the interactive puzzle, in seconds. */
    puzzle?: number;
    /** Wall time spent draining the lazy-loader, in seconds. */
    drain?: number;
    /** Wall time spent walking the page-selector's per-page URLs, in seconds. */
    walk?: number;
    /** Wall time spent in the fallback scroll loop, in seconds. */
    scroll?: number;
    /** DOM-level reader diagnostics (JSON), gathered once at finalize: which element
     * actually scrolls, lazy placeholders left unresolved, resource-timing buffer state,
     * and the announced page selector shape. Lets the host process decide whether the
     * under-delivery is a scroll-target problem or a missing DRM payload. */
    diag?: string;
};

/**
 * Converts the site DRM payload (the `detail` of the CustomEvent dispatched by the
 * JapScan DRM bootstrap) into ordered page image URLs: drops banner/honeypot entries
 * and appends the DRM access token. Mirrors `DRMProvider.CreateImageLinks`.
 * Self-contained so it can be serialized into the reader window script.
 */
export function TransformDRMPayload(detail: unknown): string[] {
    const excludedMarkers = ['_banner_', '/e44j82.jpg'];
    if (!Array.isArray(detail)) return [];
    const result: string[] = [];
    for (const entry of detail) {
        if (typeof entry !== 'string' || !entry) continue;
        // The payload ships absolute URLs (the DRM itself parses them base-less).
        if (!/^[a-z][a-z0-9+.-]*:/i.test(entry)) continue;
        if (excludedMarkers.some(marker => entry.includes(marker))) continue;
        try {
            const url = new URL(entry, 'https://www.japscan.foo/');
            url.searchParams.set('xc', '91f4');
            result.push(url.href);
        } catch { /* skip malformed entries */ }
    }
    return result;
}

/** Keep DOM-discovered links ahead of late resource-timeline discoveries. */
export function OrderPageLinks(pages: OrderedPageLink[]): string[] {
    return pages
        .slice()
        .sort((left, right) => left.order - right.order || left.discovery - right.discovery)
        .map(page => page.link);
}

/**
 * Reads the reader's total-page indicator from its DOM.
 * JapScan exposes the chapter length in a page selector (`#pages`), the same
 * information can appear in an attribute or as "Page X / N" text. Returns
 * `undefined` when no credible indicator exists (nothing to wait for).
 */
export function ReadTotalPageIndicator(): number | undefined {
    const toCount = (value: unknown): number | undefined => {
        const count = Number(value);
        return Number.isFinite(count) && count > 1 ? count : undefined;
    };
    try {
        // Primary signal: the dedicated page selector and its options.
        const select = (document.querySelector('select#pages') ?? document.querySelector('select[id*="page" i]')) as HTMLSelectElement | null;
        if (select) {
            const total = toCount(select.options?.length)
                ?? toCount(select.getAttribute('data-count'));
            if (total) return total;
        }
        // Secondary signal: any select that looks like a page selector — its id/name
        // mentions "page", or its first option is page 1.
        for (const candidate of document.querySelectorAll('select')) {
            const looksLikePages = /page/i.test(`${candidate.id} ${candidate.name} ${candidate.className}`)
                || candidate.options?.[0]?.value === '1';
            if (!looksLikePages) continue;
            const total = toCount(candidate.options?.length);
            if (total) return total;
        }
        // Tertiary signal: explicit data-attributes carrying the chapter length.
        for (const element of document.querySelectorAll('[data-pages], [data-total-pages], [data-page-count]')) {
            const total = toCount(element.getAttribute('data-pages') ?? element.getAttribute('data-total-pages') ?? element.getAttribute('data-page-count'));
            if (total) return total;
        }
        // Last resort: "Page X / N" text anywhere in the reader.
        const total = toCount((document.body?.textContent ?? '').match(/page\s*\d+\s*\/\s*(\d+)/i)?.[1]);
        if (total) return total;
    } catch { /* reader DOM not ready — treat as unknown */ }
    return undefined;
}

/**
 * Reads the per-page URLs announced by the reader's page selector.
 *
 * JapScan volume readers expose their full length in a page selector
 * (`select#pages`); on paginated layouts each option carries the URL of the
 * page document that renders that page's image. This helper returns those
 * URLs in selector order — deduplicated, same-origin, and restricted to the
 * current chapter subtree — so the reader extraction can fetch every
 * remaining page from inside the already-unlocked window. Returns an empty
 * list when the selector only holds page numbers, which means the pages live
 * in the current document and the lazy-load drain applies instead.
 * Self-contained so it can be serialized into the reader window script.
 */
export function ReadPageSelectorURLs() {
    try {
        const toPageURL = raw => {
            if (typeof raw !== 'string' || !raw.trim()) return undefined;
            const value = raw.trim();
            // Bare page numbers or labels carry no address; only paths,
            // protocol-relative and absolute URLs can be walked.
            if (!/^https?:/i.test(value) && !/^\/\//.test(value) && !/^\//.test(value)) return undefined;
            try {
                const url = new URL(value, location.href);
                if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
                if (url.hostname !== location.hostname) return undefined;
                // Restrict to the current reader document: skip the page itself
                // and anything outside the chapter subtree (next-chapter links).
                const pathname = location.pathname.replace(/\/+$/, '') + '/';
                const candidate = url.pathname.replace(/\/+$/, '') + '/';
                if (candidate === pathname && !url.search) return undefined;
                if (candidate !== pathname && !candidate.startsWith(pathname) && !pathname.startsWith(candidate)) return undefined;
                return url.href;
            } catch { return undefined; }
        };
        const results = [];
        const add = url => { if (url && !results.includes(url)) results.push(url); };
        const readOption = option => {
            if (!option) return;
            const getAttribute = name => typeof option.getAttribute === 'function' ? option.getAttribute(name) : undefined;
            for (const raw of [getAttribute('data-url'), getAttribute('data-href'), getAttribute('data-link'), getAttribute('data-page-url'), getAttribute('data-page'), getAttribute('href')]) {
                add(toPageURL(raw));
            }
            add(toPageURL(option.value ?? option.textContent));
        };
        try {
            for (const select of document.querySelectorAll('select')) {
                const first = (() => { try { return select.options?.[0]; } catch { return undefined; } })();
                const looksLikePageSelector = /page/i.test(`${select.id} ${select.name} ${select.className}`)
                    || /page/i.test(select.getAttribute?.('data-role') ?? '')
                    || !!first && (toPageURL(first.value) || toPageURL(first.getAttribute?.('data-url')));
                if (!looksLikePageSelector) continue;
                const options = (() => { try { return Array.from(select.options ?? []); } catch { return []; } })();
                for (const option of options) readOption(option);
            }
        } catch { /* reader DOM not ready — nothing to walk */ }
        return results;
    } catch {
        return [];
    }
}

/**
 * Reads the numeric page range announced by a page-like selector whose options
 * carry bare page numbers instead of URLs (JapScan volume readers: `select#pages`
 * holds one option per page — `value="1"…"N"` — while the site builds each
 * page-document address in its reader script from the current path). Returns
 * `{ min, max }` when such a range is detected, `undefined` otherwise.
 * Self-contained so it can be serialized into the reader window script.
 */
export function ReadPageSelectorRange() {
    try {
        const looksPageLike = select => {
            const first = (() => { try { return select.options?.[0]; } catch { return undefined; } })();
            return /page/i.test(`${select.id} ${select.name} ${select.className}`)
                || /page/i.test(select.getAttribute?.('data-role') ?? '')
                || !!first && (/^\s*\d{1,5}\s*$/.test(String(first.value ?? '')) || /page/i.test(String(first.textContent ?? '')));
        };
        for (const select of document.querySelectorAll('select')) {
            if (!looksPageLike(select)) continue;
            const options = (() => { try { return Array.from(select.options ?? []); } catch { return []; } })();
            if (options.length < 2) continue;
            const numbers = [];
            for (const option of options) {
                const raw = String(option.value ?? option.textContent ?? '').trim();
                const match = raw.match(/^(\d{1,5})$/);
                if (match) numbers.push(Number(match[1]));
            }
            if (numbers.length >= 2) {
                let min = numbers[0], max = numbers[0];
                for (const n of numbers) { if (n < min) min = n; if (n > max) max = n; }
                if (max < 100000) return { min, max };
            }
            // Numbered labels instead of bare values ("1", "Page 1" …): the option
            // count is the only reliable extent — the walk's probe validates it.
            return { min: 1, max: options.length };
        }
    } catch { /* reader DOM not ready — treat as unknown */ }
    return undefined;
}

/**
 * DOM-level reader diagnostics, gathered once at finalize and returned as JSON so the
 * host process can log them: which element actually scrolls, how many lazy placeholders
 * never resolved, whether the resource-timing buffer hides the site's own fetch storm,
 * and the shape of the announced page selector. Self-contained so it can be serialized
 * into the reader window script (its own small isCDN copy — no closure dependencies).
 */
export function GatherReaderDiagnostics() {
    const out = {} as Record<string, unknown>;
    const isCDN = (u: unknown) => {
        if (typeof u !== 'string' || !u || !/\.(jpe?g|png|webp|gif|avif|bmp|tiff?)(?:[?#]|$)/i.test(u)) return false;
        try {
            const url = new URL(u, location.href);
            return /(?:^|\.)japscan\./i.test(url.hostname);
        } catch { return false; }
    };
    try {
        const de = document.documentElement;
        out.win = {
            innerHeight: window.innerHeight,
            docScrollHeight: de ? de.scrollHeight : 0,
            scrollY: Math.round(window.scrollY || 0),
        };
    } catch { /* non-fatal */ }
    const scrollers: unknown[] = [];
    try {
        for (const el of Array.from(document.querySelectorAll('*'))) {
            if (scrollers.length >= 8) break;
            if (el.scrollHeight - el.clientHeight < 300) continue;
            const cs = window.getComputedStyle(el);
            const overflowY = cs.overflowY;
            if (overflowY !== 'auto' && overflowY !== 'scroll' && overflowY !== 'overlay') continue;
            const htmlel = el as HTMLElement;
            scrollers.push({
                tag: el.tagName.toLowerCase(),
                id: (el.id || '').slice(0, 60),
                cls: String(htmlel.className || '').slice(0, 80),
                client: el.clientHeight,
                scroll: el.scrollHeight,
                overflowY,
            });
        }
    } catch { /* non-fatal */ }
    out.scrollers = scrollers;
    let totalImages = 0, resolvedCDN = 0, lazyUnresolved = 0;
    try {
        for (const el of Array.from(document.querySelectorAll('img'))) {
            totalImages++;
            let src = '';
            try { src = el.currentSrc || el.getAttribute('src') || ''; } catch { /* non-fatal */ }
            if (isCDN(src)) resolvedCDN++;
            let hasLazy = false;
            for (const attr of ['data-src', 'data-original', 'data-lazy-src', 'data-lazy', 'data-image', 'data-url', 'data-srcset']) {
                try { if (el.getAttribute(attr)) { hasLazy = true; break; } } catch { /* non-fatal */ }
            }
            if (hasLazy && !isCDN(src)) lazyUnresolved++;
        }
    } catch { /* non-fatal */ }
    out.images = { total: totalImages, resolvedCDN, lazyUnresolved };
    try {
        const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
        let fetchCDN = 0, imgCDN = 0, otherCDN = 0;
        for (const entry of entries) {
            if (!isCDN(entry.name)) continue;
            if (entry.initiatorType === 'fetch' || entry.initiatorType === 'xmlhttprequest') fetchCDN++;
            else if (entry.initiatorType === 'img') imgCDN++;
            else otherCDN++;
        }
        out.buffer = { total: entries.length, fetchCDN, imgCDN, otherCDN };
    } catch { /* non-fatal */ }
    try {
        const select = document.querySelector('select#pages') as HTMLSelectElement | null;
        if (select) {
            const options = Array.from(select.options || []);
            const numbers: number[] = [];
            for (const option of options) {
                const n = Number(String(option.value ?? '').trim());
                if (Number.isFinite(n) && n > 0 && n < 100000) numbers.push(n);
            }
            const result: { found: boolean; options: number; min?: number; max?: number } = { found: true, options: options.length };
            if (numbers.length) {
                numbers.sort((a, b) => a - b);
                result.min = numbers[0];
                result.max = numbers[numbers.length - 1];
            }
            out.select = result;
        } else {
            out.select = { found: false };
        }
    } catch { /* non-fatal */ }
    try {
        const overlay = document.querySelector('#jc-overlay') as HTMLElement | null;
        if (!overlay) {
            out.overlay = false;
        } else {
            const style = window.getComputedStyle(overlay);
            out.overlay = style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity) > 0 && overlay.offsetHeight > 0;
        }
    } catch { out.overlay = 'unknown'; }
    return out;
}

/**
 * Extracts the page list from a visible JapScan reader.
 *
 * The reader is opened with the site DRM bootstrap as preload (the same one
 * `DRMProvider.CreateImageLinks` uses in its own window): once the page is
 * unlocked, the reader's own protected script decodes its embedded page list and
 * dispatches it as a CustomEvent. Listening for that event inside the same window
 * avoids the DRM provider's second window, whose hardcoded 30s budget expires
 * before JapScan's async anti-bot (`captcha_d.js`) even shows its puzzle.
 *
 * JapScan locks its reader with its own anti-bot puzzle (`#jc-overlay`) which is
 * rendered asynchronously — sometimes only AFTER this script started (the window
 * is visible, so the user can solve it in place). The scroll loop therefore
 * pauses whenever the overlay shows up and resumes once it is gone, instead of
 * scraping a locked page (which yields an incomplete page list and CDN 404s).
 *
 * The DRM payload (page-ordered, complete) wins when it decoded; otherwise the
 * DOM lazy-load drain below is used. When the reader under-delivers although
 * its own page selector announces more pages (volume lazy-loaders stop
 * mounting after roughly 110 images), the extraction walks the selector's
 * per-page URLs from inside the same unlocked window and harvests the image
 * each fetched page renders — no second DRM window with its own puzzle.
 * Returns the collected image links together with the reader's announced
 * total page count (when its page indicator was found) and the number of
 * pages the DRM payload delivered, so callers can detect an incomplete
 * result.
 */
export async function ExtractPagesFromReader(referer: string): Promise<ReaderExtraction> {
    // Event name shared between the DRM bootstrap (preload) and the extraction script.
    // Random per call so concurrent reader windows cannot observe each other.
    const eventName = `jkn${Math.random().toString(36).slice(2, 10)}`;
    const script = `
        (() => {
            const IMG_RE = /\\.(jpe?g|png|webp|gif|avif|bmp|tiff?)(?:[?#]|$)/i;
            const isCDN = u => {
                if (typeof u !== 'string' || !u || !IMG_RE.test(u)) return false;
                try {
                    const url = new URL(u, location.href);
                    // Volume readers may use a same-origin proxy or a CDN subdomain;
                    // accept JapScan-owned hosts, while rejecting unrelated page assets.
                    return /(?:^|\\.)japscan\\./i.test(url.hostname);
                } catch { return false; }
            };
            const isBlocked = () => {
                try {
                    const overlay = document.querySelector('#jc-overlay');
                    if (overlay) {
                        // The overlay can linger in the DOM after the puzzle was solved
                        // (hidden via CSS). Only treat it as blocking when it is actually
                        // visible on screen — otherwise the user can already interact.
                        const style = window.getComputedStyle(overlay);
                        const visible = style.display !== 'none'
                            && style.visibility !== 'hidden'
                            && parseFloat(style.opacity) > 0
                            && overlay.offsetHeight > 0;
                        if (visible) return true;
                    }
                    return !!(window.__captcha && window.__captcha.needed === true);
                } catch { return false; }
            };
            const seen = new Map();
            let discovery = 0;
            const addCandidate = (u, order = Number.POSITIVE_INFINITY) => {
                if (typeof u !== 'string' || !u) return;
                const value = u.trim();
                if (!isCDN(value)) return;
                const link = new URL(value, location.href).href;
                const existing = seen.get(link);
                if (existing) {
                    // A URL can enter the resource timeline before its <img> is
                    // attached. Let the later DOM observation correct its order.
                    existing.order = Math.min(existing.order, order);
                } else {
                    seen.set(link, { link, order, discovery: discovery++ });
                }
            };
            // Harvest image URLs from a same-origin page document fetched through
            // the page selector (see enumeratePageSelectorImages below). Same CDN
            // filter as the live reader; orderBase keeps each fetched page in its
            // selector position relative to the pages the live DOM mounts.
            const scanFetchedPage = (root, orderBase) => {
                let domOrder = 0;
                const order = () => orderBase + domOrder++;
                try {
                    root.querySelectorAll('img, source, [data-src], [data-original], [data-lazy-src], [data-lazy], [data-image], [data-url]').forEach(el => {
                        const at = order();
                        const srcs = [
                            el.currentSrc,
                            el.src,
                            el.getAttribute('src'),
                            el.getAttribute('data-src'),
                            el.getAttribute('data-original'),
                            el.getAttribute('data-lazy-src'),
                            el.getAttribute('data-lazy'),
                            el.getAttribute('data-image'),
                            el.getAttribute('data-url'),
                        ];
                        srcs.forEach(value => addCandidate(value, at));
                    });
                } catch (e) {}
            };
            const orderPageLinks = ${OrderPageLinks.toString()};
            const readTotalPages = ${ReadTotalPageIndicator.toString()};
            // Site DRM payload: the page's protected script decodes its embedded
            // page list and the DRM bootstrap re-dispatches it as a CustomEvent
            // (every ~256ms once decoded). Prefer it over DOM scraping: it is
            // page-ordered and complete, including pages the lazy-loader never mounts.
            const transformDRMPayload = ${TransformDRMPayload.toString()};
            const drmPages = [];
            try {
                window.addEventListener('${eventName}', event => {
                    try {
                        const list = transformDRMPayload(event.detail);
                        if (list.length) drmPages.splice(0, drmPages.length, ...list);
                    } catch (e) {}
                });
            } catch (e) {}
            const collect = () => {
                try {
                    // Scan all image/lazy attributes, including volume-specific names.
                    let domOrder = 0;
                    document.querySelectorAll('img, source, [data-src], [data-original], [data-lazy-src], [data-lazy], [data-image], [data-url]').forEach(el => {
                        const order = domOrder++;
                        const srcs = [
                            el.currentSrc,
                            el.src,
                            el.getAttribute('src'),
                            el.getAttribute('srcset'),
                            el.getAttribute('data-src'),
                            el.getAttribute('data-original'),
                            el.getAttribute('data-lazy-src'),
                            el.getAttribute('data-lazy'),
                            el.getAttribute('data-image'),
                            el.getAttribute('data-url'),
                        ];
                        srcs.flatMap(value => typeof value === 'string' && value.includes(',')
                            ? value.split(',').map(candidate => candidate.trim().split(/\\s+/)[0])
                            : [value]).forEach(value => addCandidate(value, order));
                    });
                } catch (e) {}
                try {
                    performance.getEntriesByType('resource').forEach(entry => {
                        if (entry && isCDN(entry.name) && (!entry.initiatorType || entry.initiatorType === 'img' || entry.initiatorType === 'fetch' || entry.initiatorType === 'xmlhttprequest')) addCandidate(entry.name);
                    });
                } catch (e) {}
                try {
                    // Some full-volume readers ship every page URL in inline JS rather
                    // than creating all <img> nodes. Extract JapScan image URLs from
                    // script/style text before scrolling.
                    const text = Array.from(document.scripts).map(script => script.textContent || '').join('\\n');
                    const matches = text.match(/https?:\\/\\/[^\\s"'\\\\]+\\.(?:jpe?g|png|webp|gif|avif|bmp|tiff?)(?:[?#][^\\s"'\\\\]*)?/gi) || [];
                    matches.forEach(addCandidate);
                } catch (e) {}
            };
            const realLoads = () => {
                try {
                    return performance.getEntriesByType('resource').filter(e => isCDN(e.name) && (e.decodedBodySize || 0) > 10_000).length;
                } catch { return 0; }
            };
            // === URL-construction probe (diagnostic) ===
            // Wraps the site's own image-URL construction inside the reader window so we
            // can see EXACTLY which CDN URLs the site builds, when, and what stops it at
            // ~110: request pattern (per-2s buckets), response statuses (no-cors opaque
            // responses report 0), img src assignments vs fetch/XHR preloads, observer
            // activity (IntersectionObserver = lazy mount, MutationObserver = recycling),
            // and any uncaught page error that could halt the mount loop. The probe never
            // alters behavior: originals are always invoked with the same args and the
            // same return values.
            const nativeFetch = window.fetch;
            const installUrlProbe = () => {
                const out = {
                    fetch: 0, xhr: 0, imgSrc: 0,
                    distinct: [], imgUrls: [], statuses: {},
                    firstMs: -1, lastMs: -1, buckets: [],
                    io: { instances: 0, observed: 0, callbacks: 0, intersecting: 0, roots: [] },
                    mo: { instances: 0, observed: 0 },
                    errors: [],
                };
                const t0 = Date.now();
                const BUCKET_MS = 2000;
                const touch = ms => {
                    if (out.firstMs < 0) out.firstMs = ms;
                    out.lastMs = ms;
                    const b = Math.floor(ms / BUCKET_MS);
                    while (out.buckets.length <= b) out.buckets.push(0);
                    out.buckets[b]++;
                };
                const record = (raw, kind) => {
                    try {
                        if (typeof raw !== 'string' || !raw.trim()) return;
                        const url = new URL(raw.trim(), location.href);
                        if (!/(?:^|\\.)japscan\\./i.test(url.hostname)) return;
                        const ms = Date.now() - t0;
                        touch(ms);
                        if (kind === 'fetch') out.fetch++;
                        else if (kind === 'xhr') out.xhr++;
                        else out.imgSrc++;
                        const href = url.href;
                        if (out.distinct.length < 300 && !out.distinct.includes(href)) out.distinct.push(href);
                        // Img-assigned URLs only: fetch-only preloads (session-random
                        // warm-ups) never reach an <img>, so imgUrls is the site's
                        // complete page list in construction (= display) order.
                        if (kind === 'img' && !out.imgUrls.includes(href)) out.imgUrls.push(href);
                    } catch (e) {}
                };
                const noteStatus = (code, kind) => {
                    try {
                        const key = kind + ':' + String(code);
                        out.statuses[key] = (out.statuses[key] || 0) + 1;
                    } catch (e) {}
                };
                try {
                    if (typeof window.fetch === 'function') {
                        const orig = window.fetch;
                        window.fetch = function (...args) {
                            try {
                                const input = args[0];
                                record(typeof input === 'object' && input ? String(input.url || '') : String(input), 'fetch');
                            } catch (e) {}
                            const p = orig.apply(this, args);
                            try {
                                p.then(r => { try { noteStatus(r.status, 'fetch'); } catch (e) {} }, () => { try { noteStatus('err', 'fetch'); } catch (e) {} });
                            } catch (e) {}
                            return p;
                        };
                    }
                } catch (e) {}
                try {
                    const origOpen = XMLHttpRequest.prototype.open;
                    XMLHttpRequest.prototype.open = function (...args) {
                        try { this.__urlProbeUrl = String(args[1] || ''); } catch (e) {}
                        return origOpen.apply(this, args);
                    };
                    const origSend = XMLHttpRequest.prototype.send;
                    XMLHttpRequest.prototype.send = function (...args) {
                        try {
                            if (this.__urlProbeUrl) {
                                record(this.__urlProbeUrl, 'xhr');
                                const xhr = this;
                                this.addEventListener('load', () => { try { noteStatus(xhr.status, 'xhr'); } catch (e) {} }, { once: true });
                                this.addEventListener('error', () => { try { noteStatus('err', 'xhr'); } catch (e) {} }, { once: true });
                            }
                        } catch (e) {}
                        return origSend.apply(this, args);
                    };
                } catch (e) {}
                try {
                    const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
                    const setter = desc && desc.set;
                    if (setter) {
                        Object.defineProperty(HTMLImageElement.prototype, 'src', {
                            get: desc.get,
                            set: function (v) {
                                try { record(String(v), 'img'); } catch (e) {}
                                return setter.call(this, v);
                            },
                            configurable: true,
                        });
                    }
                } catch (e) {}
                try {
                    const origSetAttr = Element.prototype.setAttribute;
                    Element.prototype.setAttribute = function (name, value) {
                        try {
                            if (name === 'src' || name === 'data-src' || name === 'data-original' || name === 'data-lazy-src') record(String(value), 'img');
                        } catch (e) {}
                        return origSetAttr.call(this, name, value);
                    };
                } catch (e) {}
                try {
                    const OrigIO = window.IntersectionObserver;
                    if (typeof OrigIO === 'function') {
                        window.IntersectionObserver = class extends OrigIO {
                            constructor (cb, options) {
                                out.io.instances++;
                                try {
                                    const root = options && options.root;
                                    out.io.roots.push(String((root && (root.className || root.id)) || (root === null ? 'viewport' : '')) || 'default');
                                } catch (e) {}
                                super((entries, obs) => {
                                    out.io.callbacks++;
                                    try { for (const en of entries) if (en.isIntersecting) out.io.intersecting++; } catch (e) {}
                                    return cb(entries, obs);
                                }, options);
                            }
                            observe (target) {
                                out.io.observed++;
                                return super.observe(target);
                            }
                        };
                    }
                } catch (e) {}
                try {
                    const OrigMO = window.MutationObserver;
                    if (typeof OrigMO === 'function') {
                        window.MutationObserver = class extends OrigMO {
                            constructor (cb) {
                                out.mo.instances++;
                                super(cb);
                            }
                            observe (target, options) {
                                out.mo.observed++;
                                return super.observe(target, options);
                            }
                        };
                    }
                } catch (e) {}
                try {
                    window.addEventListener('error', e => {
                        if (out.errors.length < 5) out.errors.push(String((e && (e.message || e.error)) || 'error').slice(0, 160));
                    }, true);
                    window.addEventListener('unhandledrejection', e => {
                        if (out.errors.length < 5) out.errors.push('rejection: ' + String((e && e.reason) || '').slice(0, 160));
                    }, true);
                } catch (e) {}
                return {
                    report () {
                        return {
                            fetch: out.fetch,
                            xhr: out.xhr,
                            imgSrc: out.imgSrc,
                            distinct: out.distinct.length,
                            truncated: out.distinct.length >= 300,
                            urls: out.distinct.slice(0, 300),
                            imgUrls: out.imgUrls.slice(0, 300),
                            statuses: out.statuses,
                            firstMs: out.firstMs,
                            lastMs: out.lastMs,
                            buckets: out.buckets,
                            io: out.io,
                            mo: out.mo,
                            errors: out.errors,
                        };
                    },
                };
            };
            const urlProbe = installUrlProbe();
            // Merge the preload-time capture (installed before ANY page script, so it sees
            // the load-time burst and the site's aliased fetch/img references) with the
            // post-load capture above (fallback when the preload probe is absent).
            const urlProbeReport = () => {
                try {
                    const pre = window.__jpUrlProbe && typeof window.__jpUrlProbe.report === 'function' ? window.__jpUrlProbe.report() : null;
                    if (pre) {
                        try { pre.localAfter = urlProbe.report(); } catch (e) {}
                        return pre;
                    }
                    return urlProbe.report();
                } catch (e) {
                    return { error: String(e) };
                }
            };
            // Pause while JapScan's own puzzle is on screen: the window is visible,
            // so the user can slide the puzzle back into order; scraping while it is
            // up collects placeholders/CDN 404s only. The overlay node can linger in
            // the DOM after the puzzle was solved (same quirk as JapScan's Turnstile
            // iframe), so freshly decoded real images are used as the authoritative
            // "reader is usable again" signal instead of the overlay disappearing.
            const waitWhileBlocked = async (budgetMs = 180_000) => {
                const started = Date.now();
                const baseline = realLoads();
                let lastSeenSize = seen.size;
                let announced = false;
                let lastCheck = Date.now();
                while (Date.now() - started < budgetMs) {
                    collect();
                    // Exit as soon as the reader is usable again: the puzzle is
                    // gone, fresh real images loaded (resource-timing counter
                    // grew), or new DOM images appeared even though the counter
                    // did not increase (cached images) — DOM growth also proves
                    // the reader is usable.
                    if (!isBlocked() || realLoads() > baseline + 2 || seen.size > lastSeenSize) break;
                    lastSeenSize = seen.size;
                    const now = Date.now();
                    if (now - lastCheck < 500) {
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                    lastCheck = now;
                    if (!announced) {
                        announced = true;
                        try { console.warn('[KUMO] JapScan overlay detected - waiting for user to solve the puzzle'); } catch {}
                    }
                }
                timing.puzzleMs += Date.now() - started;
            };
            // Per-phase wall-time counters, reported in the finalize log so we can
            // see where the time actually goes (puzzle / lazy-load drain /
            // page-selector walk / scroll fallback).
            const timing = { puzzleMs: 0, drainMs: 0, walkMs: 0, scrollMs: 0 };
            collect();
            return new Promise(async resolve => {
                // Hard extraction deadline: every phase budget below is clamped to the
                // remaining time, and the timer finalizes unconditionally at the end —
                // the old worst case (puzzle 180s + drain 90s + walk 100s + scroll 125s
                // = 495s) outlived the host's 300s chapter-update budget and produced
                // the spurious timeout card on a locked reader.
                const EXTRACT_DEADLINE = 240_000;
                const deadlineAt = Date.now() + EXTRACT_DEADLINE;
                const remain = () => Math.max(0, deadlineAt - Date.now());
                await waitWhileBlocked(Math.min(180_000, remain()));
                // Volume readers mount only the first screenful of images; the reader's
                // own page selector announces the real total. Drain the lazy-loader:
                // jump to the bottom and wait until that many images were seen. Give
                // up early when the count stalls (unreliable indicator) or the budget
                // is exhausted — the host-side completeness check takes over then.
                const total = readTotalPages();
                const drmComplete = () => drmPages.length > 0 && (!total || drmPages.length >= total);
                let domCount = 0;
                let selectorCount = 0;                    const hardTimer = setTimeout(() => {
                        try { collect(); } catch (e) {}
                        resolve(finalize());
                    }, EXTRACT_DEADLINE);
                    const finalize = () => {
                    const domLinks = orderPageLinks(Array.from(seen.values()));
                    // The DRM payload is authoritative (page order, complete) when it
                    // decoded. Otherwise, when the URL-construction probe captured the
                    // reader's complete image list (it runs as preload, before any page
                    // script, so it sees every <img> the site builds — volume readers
                    // build ALL announced pages even though the lazy-loader only MOUNTS
                    // ~110), the probe's img-assigned URLs are the full page list in the
                    // site's own construction order. Adopt them only when they genuinely
                    // extend the DOM result AND cover the announced total. The order
                    // direction is anchored on the first DOM-mounted pages: the lazy-
                    // loader mounts in reading order, so the first mounted page must sit
                    // near the START of the construction list (forward) or near its END
                    // (the site built the list reversed). The first few DOM pages are
                    // tried because a banner/honeypot may precede the first real page
                    // (and banner markers are filtered from the probe list), and URLs
                    // are compared without their query so a mount-time token/redirect
                    // variant still matches its constructed URL.
                    const probe = urlProbeReport();
                    const rawProbePages = (probe && Array.isArray(probe.imgUrls)) ? probe.imgUrls : [];
                    const probePages = rawProbePages.filter(u => typeof u === 'string' && u.indexOf('_banner_') < 0 && u.indexOf('/e44j82.jpg') < 0);
                    const stripQuery = u => String(u).split('?')[0];
                    const probeIdxOf = u => {
                        const exact = probePages.indexOf(u);
                        if (exact >= 0) return exact;
                        const bare = stripQuery(u);
                        return probePages.findIndex(p => stripQuery(p) === bare);
                    };
                    let probeAnchor = -1;
                    let probeReversed = false;
                    for (const u of domLinks.slice(0, 5)) {
                        const i = probeIdxOf(u);
                        if (i < 0) continue;
                        if (i <= Math.max(10, Math.floor(probePages.length * 0.2))) { probeAnchor = i; probeReversed = false; break; }
                        if (i >= Math.floor(probePages.length * 0.8)) { probeAnchor = i; probeReversed = true; break; }
                    }
                    const domFound = domLinks.filter(u => probeIdxOf(u) >= 0).length;
                    const probeOverlap = domLinks.length ? domFound / domLinks.length : 1;
                    const adoptProbe = !drmComplete()
                        && probePages.length >= Math.max(2, domLinks.length + 5)
                        && (!total || probePages.length >= total)
                        && probeAnchor >= 0
                        && probeOverlap >= 0.5;
                    let probeCount = 0;
                    let links;
                    if (drmComplete()) {
                        links = [...new Set([...drmPages, ...domLinks])];
                    } else if (adoptProbe) {
                        probeCount = probePages.length - domLinks.length;
                        links = probeReversed ? probePages.slice().reverse() : probePages.slice();
                        // Append only DOM-discovered URLs the probe missed that are chapter
                        // images. The reader also mounts chrome on the www host (top banners,
                        // donate icons, japys placeholders) — those must not download as pages.
                        for (const link of domLinks) {
                            if (link.indexOf('_banner_') >= 0 || link.indexOf('/e44j82.jpg') >= 0 || links.includes(link)) continue;
                            // Site chrome (top banners, donate icons, japys placeholders) lives on the
                            // main www host; chapter images live on the CDN subhost. A DOM URL the probe
                            // missed that is hosted on the main site is chrome, not a page — never
                            // download it. [.] character classes avoid backslash escaping inside the
                            // serialized script.
                            try {
                                const host = new URL(link, location.href).hostname;
                                if (host === location.hostname || /^www[.]/i.test(host)) continue;
                            } catch (e) { continue; }
                            links.push(link);
                        }
                    } else {
                        links = domLinks;
                    }
                    console.log('[JapScan] ' + location.pathname + ' -> ' + links.length + ' pages (drm: ' + drmPages.length + ', dom: ' + domCount + ', selector: ' + selectorCount + ', probe: ' + probeCount + ', total: ' + (total || 'none') + ') puzzle: ' + (timing.puzzleMs / 1000).toFixed(1) + 's, drain: ' + (timing.drainMs / 1000).toFixed(1) + 's, walk: ' + (timing.walkMs / 1000).toFixed(1) + 's, scroll: ' + (timing.scrollMs / 1000).toFixed(1) + 's');
                    let readerDiag = '{}';
                    try {
                        const diag = gatherDiagnostics();
                        diag.drmPages = drmPages.length;
                        diag.domSeen = seen.size;
                        diag.urlProbe = urlProbeReport();
                        diag.probeHarvest = {
                            domLen: domLinks.length,
                            domFirst: domLinks.slice(0, 3),
                            probeLen: probePages.length,
                            anchorIdx: probeAnchor,
                            reversed: probeReversed,
                            overlap: +probeOverlap.toFixed(3),
                            adopt: adoptProbe,
                        };
                        readerDiag = JSON.stringify(diag);
                    } catch (e) {
                        readerDiag = JSON.stringify({ error: String(e) });
                    }
                    return {
                        links,
                        total: total ?? readTotalPages(),
                        drm: drmPages.length,
                        dom: domCount,
                        selector: selectorCount,
                        // Wall-clock seconds per phase; these travel back with the result
                        // because the reader window's own console output is not visible
                        // to the host process — the host logs them instead (JapScan.ts).
                        puzzle: +(timing.puzzleMs / 1000).toFixed(1),
                        drain: +(timing.drainMs / 1000).toFixed(1),
                        walk: +(timing.walkMs / 1000).toFixed(1),
                        scroll: +(timing.scrollMs / 1000).toFixed(1),
                        /** Pages recovered from the URL-construction probe's img-assigned list. */
                        probe: probeCount,
                        diag: readerDiag,
                    };
                };
                // JapScan volumes announce their full length in a page selector
                // (#pages). When its options carry a URL per page, walk them from
                // inside this same, already-unlocked window: each page is fetched
                // same-origin and the image URL it renders is harvested. The DRM
                // provider's own second window is avoided — its 30s budget expires
                // on the anti-bot puzzle, while this window solved it in place.
                const readPageSelectorURLs = ${ReadPageSelectorURLs.toString()};
                const readPageSelectorRange = ${ReadPageSelectorRange.toString()};
                const gatherDiagnostics = ${GatherReaderDiagnostics.toString()};
                const enumeratePageSelectorImages = async budgetMs => {
                    const walkStarted = Date.now();
                    let urls = readPageSelectorURLs();
                    // Volume selectors often hold bare page numbers instead of per-page
                    // URLs (the site builds each page-document address in its reader
                    // script). Synthesize the page documents from the current path and
                    // probe every candidate template with a real same-origin fetch:
                    // only a template that renders an unseen CDN image is kept, so a
                    // wrong guess wastes nothing (the lazy-loader stops mounting after
                    // ~110 images although the selector announces the real total).
                    if (!urls.length) {
                        const range = readPageSelectorRange();
                        if (range) {
                            const path = location.pathname || '/';
                            const base = path.endsWith('/') ? path : path + '/';
                            const templates = [
                                n => base + n + '/',
                                n => base + 'page/' + n + '/',
                                n => base + '?page=' + n,
                                n => base + '?p=' + n,
                            ];
                            const currentURL = location.href.split('#')[0];
                            const sample = Math.max(range.min, Math.min(range.max, range.min + 1));
                            const countsFreshImages = doc => {
                                const fresh = new Set();
                                try {
                                    doc.querySelectorAll('img, source, [data-src], [data-original], [data-lazy-src], [data-lazy], [data-image], [data-url]').forEach(el => {
                                        for (const raw of [el.currentSrc, el.src, el.getAttribute('src'), el.getAttribute('data-src'), el.getAttribute('data-original'), el.getAttribute('data-lazy-src'), el.getAttribute('data-lazy'), el.getAttribute('data-image'), el.getAttribute('data-url')]) {
                                            if (typeof raw !== 'string' || !raw.trim()) continue;
                                            try {
                                                const url = new URL(raw.trim(), location.href).href;
                                                if (isCDN(url) && !seen.has(url)) fresh.add(url);
                                            } catch (e) {}
                                        }
                                    });
                                } catch (e) {}
                                return fresh.size;
                            };
                            for (const template of templates) {
                                const probeURL = new URL(template(sample), location.href).href;
                                if (probeURL === currentURL) continue;
                                const controller = new AbortController();
                                const timer = setTimeout(() => controller.abort(), 8_000);
                                let ok = false;
                                try {
                                    const response = await nativeFetch(probeURL, {
                                        credentials: 'include',
                                        signal: controller.signal,
                                        headers: { 'Accept': 'text/html' },
                                    });
                                    if (response.ok) {
                                        const html = await response.text();
                                        const doc = new DOMParser().parseFromString(html, 'text/html');
                                        ok = countsFreshImages(doc) > 0;
                                    }
                                } catch (e) {}
                                finally { clearTimeout(timer); }
                                if (!ok) continue;
                                for (let n = range.min; n <= range.max; n++) {
                                    const url = new URL(template(n), location.href).href;
                                    if (url !== currentURL && !urls.includes(url)) urls.push(url);
                                }
                                console.log('[JapScan] page-selector synthesis: ' + urls.length + ' URLs via ' + probeURL);
                                break;
                            }
                        }
                    }
                    console.log('[JapScan] page-selector walk: ' + urls.length + ' walkable URLs found');
                    if (!urls.length) {
                        timing.walkMs = Date.now() - walkStarted;
                        return false;
                    }
                    const deadline = Date.now() + budgetMs;
                    const workers = Math.min(3, urls.length);
                    let next = 0;
                    const run = async () => {
                        while (next < urls.length) {
                            if (Date.now() > deadline) return;
                            if (drmComplete()) return;
                            if (total && seen.size >= total) return;
                            if (isBlocked()) {
                                await waitWhileBlocked(Math.min(60_000, remain()));
                                if (isBlocked()) return;
                            }
                            const index = next++;
                            const url = urls[index];
                            const controller = new AbortController();
                            const timer = setTimeout(() => controller.abort(), 15_000);
                            try {
                                const response = await nativeFetch(url, {
                                    credentials: 'include',
                                    signal: controller.signal,
                                    headers: { 'Accept': 'text/html' },
                                });
                                if (response.ok) {
                                    const html = await response.text();
                                    try {
                                        const doc = new DOMParser().parseFromString(html, 'text/html');
                                        scanFetchedPage(doc, (index + 1) * 1_000_000);
                                    } catch (e) {}
                                }
                            } catch (e) {}
                            finally { clearTimeout(timer); }
                        }
                    };
                    try {
                        await Promise.all(Array.from({ length: workers }, () => run()));
                    } catch (e) {}
                    timing.walkMs = Date.now() - walkStarted;
                    console.log('[JapScan] page-selector walk complete: ' + seen.size + ' total pages after walk');
                    return true;
                };
                if (total) {
                    const drainStarted = Date.now();
                    let stallRounds = 0;
                    let lastSeen = seen.size;
                    while (seen.size < total && Date.now() - drainStarted < Math.min(90_000, remain()) && stallRounds < 4) {
                        if (drmComplete()) {
                            collect();
                            timing.drainMs = Date.now() - drainStarted;
                            resolve(finalize());
                            return;
                        }
                        try { window.scrollTo(0, document.body?.scrollHeight || 0); } catch (e) {}
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        if (isBlocked()) await waitWhileBlocked(Math.min(180_000, remain()));
                        collect();
                        stallRounds = seen.size > lastSeen ? 0 : stallRounds + 1;
                        lastSeen = seen.size;
                    }
                    timing.drainMs = Date.now() - drainStarted;
                }
                // Snapshot DOM pages before the selector walk so we can report
                // how many pages each source contributed.
                domCount = seen.size;
                // The reader under-delivered (volume lazy-loaders stop mounting
                // after ~110 images although the selector announces more): recover
                // the remaining pages through the same-origin page walk above.
                if (!drmComplete() && total && seen.size < total) {
                    await enumeratePageSelectorImages(Math.min(100_000, remain()));
                    collect();
                }
                selectorCount = seen.size - domCount;
                let scrollStarted = 0;
                let steps = 0;
                let lastCount = 0;
                let stableRounds = 0;
                let bottomStableRounds = 0;
                const MAX_STEPS = 500;
                const STABLE_LIMIT = 20;         // no new URL for ~5s while scrolling
                const BOTTOM_STABLE_LIMIT = 8;   // at the bottom, wait ~2s more for late lazy-loads
                const STEP_MS = 250;
                const step = async () => {
                    // A puzzle can appear mid-scroll (JapScan's anti-bot re-checks
                    // continuously): pause the collection until it is solved.
                    if (isBlocked()) {
                        await waitWhileBlocked(Math.min(180_000, remain()));
                        if (isBlocked()) { // budget exhausted — report what we have
                            collect();
                            timing.scrollMs = Date.now() - scrollStarted;
                            resolve(finalize());
                            return;
                        }
                    }
                    if (drmComplete()) {
                        collect();
                        timing.scrollMs = Date.now() - scrollStarted;
                        resolve(finalize());
                        return;
                    }
                    collect();
                    try { window.scrollBy(0, Math.min(window.innerHeight || 800, 600)); } catch (e) {}
                    const atBottom = (window.innerHeight + window.scrollY) >= (document.body.scrollHeight - 30);
                    const currentCount = seen.size;
                    if (currentCount === lastCount) {
                        stableRounds++;
                    } else {
                        stableRounds = 0;
                        bottomStableRounds = 0;
                        lastCount = currentCount;
                    }
                    // Finish only when the reader is fully scrolled AND no new image
                    // appeared for a few rounds: stopping on the bottom alone would
                    // miss images whose lazy-load is still pending, and stopping on
                    // stability alone would miss pages that only appear on further
                    // scroll (slow readers keep appending while we wait).
                    if (atBottom) bottomStableRounds++;
                    const done = (atBottom && bottomStableRounds >= BOTTOM_STABLE_LIMIT && stableRounds >= STABLE_LIMIT)
                        || stableRounds >= 4 * STABLE_LIMIT
                        || (total && seen.size >= total)
                        || ++steps >= MAX_STEPS;
                    if (done) {
                        collect();
                        // Update domCount to include scroll-loop discoveries so
                        // the diagnostic correctly attributes all DOM-scraped pages.
                        domCount = seen.size - selectorCount;
                        timing.scrollMs = Date.now() - scrollStarted;
                        resolve(finalize());
                    } else {
                        setTimeout(step, STEP_MS);
                    }
                };
                scrollStarted = Date.now();
                setTimeout(step, 300);
            });
        })()
    `;
    try {
        // Open the reader with the site DRM bootstrap as preload (visible, generous
        // budget): the page's own protected script decodes its full page list once
        // the anti-bot puzzle is solved in this window — no second DRM window needed.
        const result = await FetchWindowPreloadScript<ReaderExtraction>(
            new Request(referer),
            BuildDRMPreload(eventName),
            script,
            1000,
            300_000,
            true
        );
        const links = (result?.links ?? []).filter((link, index, all) => all.indexOf(link) === index);
        return { links, total: result?.total ?? undefined, drm: result?.drm ?? undefined, dom: result?.dom ?? undefined, selector: result?.selector ?? undefined, probe: result?.probe ?? undefined, puzzle: result?.puzzle ?? undefined, drain: result?.drain ?? undefined, walk: result?.walk ?? undefined, scroll: result?.scroll ?? undefined, diag: result?.diag ?? undefined };
    } catch {
        return { links: [] };
    }
}
