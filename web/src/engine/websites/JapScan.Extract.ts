import { FetchWindowScript } from '../platform/FetchProvider';

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
 * Returns a deduplicated list of image URLs suitable for Page construction.
 */
export async function ExtractPagesFromReader(referer: string): Promise<string[]> {
    const script = `
        (() => {
            const IMG_RE = /\\.(jpe?g|png|webp|gif|avif|bmp|tiff?)(?:[?#]|$)/i;
            const isCDN = u => {
                if (typeof u !== 'string' || !u || !IMG_RE.test(u)) return false;
                try {
                    const host = new URL(u, location.href).hostname;
                    return host !== location.hostname && /japscan\\./i.test(host);
                } catch { return false; }
            };
            const isBlocked = () => {
                try {
                    return !!document.querySelector('#jc-overlay')
                        || (window.__captcha && window.__captcha.needed === true);
                } catch { return false; }
            };
            const seen = new Set();
            const collect = () => {
                try {
                    // Also scan generic data-src holders (some readers attach the
                    // lazy URL to a wrapper element instead of the <img> itself).
                    document.querySelectorAll('img, [data-src], [data-original], [data-lazy-src]').forEach(el => {
                        const srcs = el.tagName === 'IMG'
                            ? [el.currentSrc, el.src, el.getAttribute('data-src'), el.getAttribute('data-original'), el.getAttribute('data-lazy-src')]
                            : [el.getAttribute('data-src'), el.getAttribute('data-original'), el.getAttribute('data-lazy-src')];
                        srcs.forEach(u => { if (isCDN(u)) seen.add(u); });
                    });
                } catch (e) {}
                try {
                    performance.getEntriesByType('resource').forEach(entry => {
                        if (entry && isCDN(entry.name) && (!entry.initiatorType || entry.initiatorType === 'img' || entry.initiatorType === 'fetch' || entry.initiatorType === 'xmlhttprequest')) seen.add(entry.name);
                    });
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
                            resolve(Array.from(seen));
                            return;
                        }
                    }
                    document.querySelectorAll('img').forEach(img => {
                        const src = img.getAttribute('src') ?? null;
                        if (src !== null && !src.startsWith('about:') && /japscan\./i.test(src)) {
                            seen.add(src);
                        }
                    });
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
                        || ++steps >= MAX_STEPS;
                    if (done) {
                        collect();
                        resolve(Array.from(seen));
                    } else {
                        setTimeout(step, STEP_MS);
                    }
                };
                setTimeout(step, 300);
            });
        })()
    `;
    try {
        const pages = await FetchWindowScript<string[]>(new Request(referer), script, 1000, 300_000, true);
        return (pages ?? []).filter((link, index, all) => all.indexOf(link) === index);
    } catch {
        return [];
    }
}
