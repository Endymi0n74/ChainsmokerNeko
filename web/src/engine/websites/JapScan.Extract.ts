import { FetchWindowScript } from '../platform/FetchProvider';

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
};

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
 * Scrolls a visible JapScan reader to trigger lazy-loading, then collects
 * every image URL whose host is the JapScan image CDN (c*.japscan.foo).
 *
 * JapScan locks its reader with its own anti-bot puzzle (`#jc-overlay`) which is
 * rendered asynchronously — sometimes only AFTER this script started (the window
 * is visible, so the user can solve it in place). The scroll loop therefore
 * pauses whenever the overlay shows up and resumes once it is gone, instead of
 * scraping a locked page (which yields an incomplete page list and CDN 404s).
 *
 * Returns the collected image links together with the reader's announced
 * total page count (when its page indicator was found), so callers can
 * detect an incomplete lazy-load.
 */
export async function ExtractPagesFromReader(referer: string): Promise<ReaderExtraction> {
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
            const orderPageLinks = ${OrderPageLinks.toString()};
            const readTotalPages = ${ReadTotalPageIndicator.toString()};
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
                if (total) {
                    const drainStarted = Date.now();
                    let stallRounds = 0;
                    let lastSeen = seen.size;
                    while (seen.size < total && Date.now() - drainStarted < 90_000 && stallRounds < 4) {
                        try { window.scrollTo(0, document.body?.scrollHeight || 0); } catch (e) {}
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        if (isBlocked()) await waitWhileBlocked();
                        collect();
                        stallRounds = seen.size > lastSeen ? 0 : stallRounds + 1;
                        lastSeen = seen.size;
                    }
                }
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
                            resolve({ links: orderPageLinks(Array.from(seen.values())), total: total ?? readTotalPages() });
                            return;
                        }
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
                        resolve({ links: orderPageLinks(Array.from(seen.values())), total: total ?? readTotalPages() });
                    } else {
                        setTimeout(step, STEP_MS);
                    }
                };
                setTimeout(step, 300);
            });
        })()
    `;
    try {
        const result = await FetchWindowScript<ReaderExtraction>(new Request(referer), script, 1000, 300_000, true);
        const links = (result?.links ?? []).filter((link, index, all) => all.indexOf(link) === index);
        return { links, total: result?.total ?? undefined };
    } catch {
        return { links: [] };
    }
}
