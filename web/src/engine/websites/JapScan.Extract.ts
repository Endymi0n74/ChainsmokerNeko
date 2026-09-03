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
                    return !!document.querySelector('#jc-overlay')
                        || (window.__captcha && window.__captcha.needed === true);
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
            // Pause while JapScan's own puzzle is on screen: the window is visible,
            // so the user can slide the puzzle back into order; scraping while it is
            // up collects placeholders/CDN 404s only. The overlay node can linger in
            // the DOM after the puzzle was solved (same quirk as JapScan's Turnstile
            // iframe), so freshly decoded real images are used as the authoritative
            // "reader is usable again" signal instead of the overlay disappearing.
            const waitWhileBlocked = async (budgetMs = 180_000) => {
                const started = Date.now();
                const baseline = realLoads();
                let announced = false;
                let lastCheck = Date.now();
                while (Date.now() - started < budgetMs) {
                    collect();
                    if (!isBlocked()) break;
                    if (realLoads() > baseline + 2) break;
                    // Don't busy-loop: wait at least 500ms between checks.
                    // If the worst ever happens, bail out after 5s of no variation
                    // to get back to the paging flow.
                    const now = Date.now();
                    if (now - lastCheck < 500) {
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                    lastCheck = now;
                    if (!announced) {
                        announced = true;
                        try { console.warn('[KUMO] JapScan overlay detected — waiting for user to solve the puzzle'); } catch {}
                    }
                }
            };
            collect();
            return new Promise(async resolve => {
                await waitWhileBlocked();
                // Volume readers mount only the first screenful of images; the reader's
                // own page selector announces the real total. Drain the lazy-loader:
                // jump to the bottom and wait until that many images were seen. Give
                // up early when the count stalls (unreliable indicator) or the budget
                // is exhausted — the host-side completeness check takes over then.
                const total = readTotalPages();
                const drmComplete = () => drmPages.length > 0 && (!total || drmPages.length >= total);
                let domCount = 0;
                let selectorCount = 0;
                const finalize = () => {
                    const domLinks = orderPageLinks(Array.from(seen.values()));
                    // The DRM payload is authoritative (page order, complete) when it
                    // decoded; append reader-only extras that scrolling discovered.
                    const links = drmComplete()
                        ? [...new Set([...drmPages, ...domLinks])]
                        : domLinks;
                    return {
                        links,
                        total: total ?? readTotalPages(),
                        drm: drmPages.length,
                        dom: domCount,
                        selector: selectorCount,
                    };
                };
                // JapScan volumes announce their full length in a page selector
                // (#pages). When its options carry a URL per page, walk them from
                // inside this same, already-unlocked window: each page is fetched
                // same-origin and the image URL it renders is harvested. The DRM
                // provider's own second window is avoided — its 30s budget expires
                // on the anti-bot puzzle, while this window solved it in place.
                const readPageSelectorURLs = ${ReadPageSelectorURLs.toString()};
                const enumeratePageSelectorImages = async budgetMs => {
                    const urls = readPageSelectorURLs();
                    if (!urls.length) return false;
                    const deadline = Date.now() + budgetMs;
                    const workers = Math.min(3, urls.length);
                    let next = 0;
                    const run = async () => {
                        while (next < urls.length) {
                            if (Date.now() > deadline) return;
                            if (drmComplete()) return;
                            if (total && seen.size >= total) return;
                            if (isBlocked()) {
                                await waitWhileBlocked(60_000);
                                if (isBlocked()) return;
                            }
                            const index = next++;
                            const url = urls[index];
                            const controller = new AbortController();
                            const timer = setTimeout(() => controller.abort(), 15_000);
                            try {
                                const response = await fetch(url, {
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
                    return true;
                };
                if (total) {
                    const drainStarted = Date.now();
                    let stallRounds = 0;
                    let lastSeen = seen.size;
                    while (seen.size < total && Date.now() - drainStarted < 90_000 && stallRounds < 4) {
                        if (drmComplete()) {
                            collect();
                            resolve(finalize());
                            return;
                        }
                        try { window.scrollTo(0, document.body?.scrollHeight || 0); } catch (e) {}
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        if (isBlocked()) await waitWhileBlocked();
                        collect();
                        stallRounds = seen.size > lastSeen ? 0 : stallRounds + 1;
                        lastSeen = seen.size;
                    }
                }
                // Snapshot DOM pages before the selector walk so we can report
                // how many pages each source contributed.
                domCount = seen.size;
                // The reader under-delivered (volume lazy-loaders stop mounting
                // after ~110 images although the selector announces more): recover
                // the remaining pages through the same-origin page walk above.
                if (!drmComplete() && total && seen.size < total) {
                    await enumeratePageSelectorImages(100_000);
                    collect();
                }
                selectorCount = seen.size - domCount;
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
                        await waitWhileBlocked();
                        if (isBlocked()) { // budget exhausted — report what we have
                            collect();
                            resolve(finalize());
                            return;
                        }
                    }
                    if (drmComplete()) {
                        collect();
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
                        resolve(finalize());
                    } else {
                        setTimeout(step, STEP_MS);
                    }
                };
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
        return { links, total: result?.total ?? undefined, drm: result?.drm ?? undefined, dom: result?.dom ?? undefined, selector: result?.selector ?? undefined };
    } catch {
        return { links: [] };
    }
}
