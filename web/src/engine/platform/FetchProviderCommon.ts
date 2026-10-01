import protobuf from 'protobufjs';
import { Exception, InternalError } from '../Error';
import { EngineResourceKey as R } from '../../i18n/ILocale';
import { CreateRemoteBrowserWindow } from './RemoteBrowserWindow';
import { CheckAntiScrapingDetection, FetchRedirection } from './AntiScrapingDetection';
import { ShouldReloadStalledChallenge, ShouldUseForkChallengeHandling } from './ChallengeReload';
import type { FeatureFlags } from '../FeatureFlags';
import { Delay, SetTimeout, ClearTimeout } from '../BackgroundTimers';

/**
 * Exponential backoff helper for challenge polling: `base * 2^attempt`, capped.
 */
function BackoffDelay(attempt: number, base = 2000, cap = 10_000): number {
    return Math.min(base * 2 ** attempt, cap);
}

/** Cloudflare's real `cf_clearance` is always longer than this; shorter = absent/truncated. */
export const MIN_CLEARANCE_LENGTH = 201;

/**
 * Normalizes a raw `cf_clearance` read into a comparable value: a clearance shorter than
 * {@link MIN_CLEARANCE_LENGTH} is not a real one and must be treated as "no cookie".
 */
export function NormalizeClearance(value: string | undefined): string {
    return value && value.length >= MIN_CLEARANCE_LENGTH ? value : '';
}

/**
 * Advances the `cf_clearance` baseline of a single window/document.
 *
 * A clearance already present when the challenge started can never prove it was solved: the
 * challenged request already carried it, so its mere presence is not a resolution signal (the
 * same root cause as the CrunchyScan reload bug fixed on 2026-09-27, where `lastClearance = ''`
 * made the very first CDP read look like a "change" and closed the window mid-validation).
 *
 * @param previous - The baseline, or `undefined` when no read succeeded yet.
 * @param raw - The raw cookie value just read (`undefined` when the read itself failed).
 * @param seen - Every value observed so far by this poller; when provided, a value which differs
 * from the baseline but was already seen is reported as `reappeared` (churn) instead of a new
 * solve — several `cf_clearance` cookies scoped to the same URL can alternate between reads.
 * @returns The baseline to keep, whether a genuinely NEW clearance was observed, and whether the
 * observed change merely cycled back to a value already seen.
 */
export function NextClearanceState(previous: string | undefined, raw: string | undefined, seen?: Set<string>): { baseline: string | undefined; changed: boolean; reappeared: boolean } {
    if (raw === undefined) return { baseline: previous, changed: false, reappeared: false };
    const value = NormalizeClearance(raw);
    if (previous === undefined) {
        if (seen && value) seen.add(value);
        return { baseline: value, changed: false, reappeared: false };
    }
    if (value && value !== previous) {
        const reappeared = !!seen?.has(value);
        if (seen) seen.add(value);
        return { baseline: value, changed: true, reappeared };
    }
    if (seen && value) seen.add(value);
    return { baseline: previous, changed: false, reappeared: false };
}

/**
 * Minimum delay [ms] between two challenge-recovery attempts for the same origin: a fetch storm
 * hitting an unsolved challenge must not pop one recovery window per request.
 */
export const CHALLENGE_RECOVERY_COOLDOWN = 60_000;

/**
 * Budget [ms] for the recovery window: interactive challenges are capped at 150 s by the window
 * flow itself, managed challenges get enough headroom to complete their proof phase.
 */
export const CHALLENGE_RECOVERY_BUDGET = 180_000;

/**
 * Grace period [ms] between a `cf_clearance` change and the injection of the extraction script:
 * the cookie proves the challenge was solved, but the challenge document may still be the
 * current one because the post-solve navigation has not committed yet (or the site removes its
 * overlay in place a moment later). Injecting during that window runs the extraction against the
 * challenge DOM and returns nothing — the chapter list came back empty and was then cached for
 * an hour. Solvers whose page never replaces the challenge get their script after the grace
 * period anyway (bounded wait, never an endless one).
 */
export const COOKIE_CLEARANCE_DOM_GRACE = 30_000;

/**
 * Minimum age [ms] of the current challenge document before a stalled-challenge reload is
 * allowed. Cloudflare and the site's own overlay inject their clickable control a few
 * seconds *after* the load: reloading before it exists resets the proof phase, which is the
 * `ReloadStalledCloudFlareChallenge: reload #1/3` loop observed on JapScan (the widget was
 * reported absent at `poll#1`, roughly 4 s after the load, and the check fired at ~5 s).
 * The widget-presence test below still vetoes any reload once the control is rendered.
 */
export const CHALLENGE_WIDGET_RENDER_GRACE = 12_000;

/** Matches the exceptions raised when Cloudflare rejected a request (challenge header or plain 403). */
const ChallengeErrorPattern = /^(?:Derived)?Exception<FetchProvider_Fetch_(?:CloudFlareChallenge|Forbidden)>$/;

/**
 * Determines whether the given {@link error} means Cloudflare rejected a request, which a
 * challenge window may resolve (see {@link FetchProvider.Fetch}).
 */
export function IsCloudFlareChallengeError(error: unknown): boolean {
    return error instanceof Error && ChallengeErrorPattern.test(error.name);
}

/**
 * Structural markers that identify a Cloudflare challenge page served with HTTP 200. Only markup
 * generated by Cloudflare itself is matched — localized phrases such as "Un instant…" are
 * deliberately absent from the pattern, they also occur in ordinary page content.
 */
const ChallengeContentPattern = /cdn-cgi\/challenge-platform|challenges\.cloudflare\.com|id=["']challenge-form["']|cf-chl-/i;

/**
 * Determines whether the given document {@link content} is a Cloudflare challenge page which was
 * returned as a successful response instead of being rejected by a status code.
 */
export function IsCloudFlareChallengePage(content: string): boolean {
    return ChallengeContentPattern.test(content);
}

/** What a poll round of the challenge poller should do with the extraction script. */
export type ScriptInjectionAction = 'inject' | 'hold' | 'force' | 'wait';

/**
 * Decides whether the extraction script may start after a poll round.
 *
 * A `cf_clearance` change is the authoritative "solved" signal (the cookie check in the poller),
 * but it can arrive while the challenge document is still loaded: the post-solve navigation has
 * not committed yet, the site removes its overlay in place moments later, or the change belongs
 * to a solve performed in a previous window (every window baselines the cookie when it opens).
 * Injecting at that instant runs the extraction against the challenge DOM and returns an empty
 * result — the observed "0 items" chapter lists. The injection is therefore held back until the
 * document replaces the challenge, bounded by {@link COOKIE_CLEARANCE_DOM_GRACE} so cookie-only
 * solvers (whose page never navigates) still get their script.
 *
 * The deadline is **absolute**: it is anchored to the first held change and enforced even while
 * the clearance keeps changing. Cloudflare rotates `cf_clearance` on every poll round while the
 * challenge page sits (observed on JapScan: poll#1 at 7340 ms and poll#2 at 11915 ms of the same
 * document, both reporting a change), and restarting the grace on each of them made the hold
 * endless — the injection never happened and the window ended on its own timeout with an
 * exception instead of a result.
 * @param cleared - Whether the poll round considers the challenge resolved.
 * @param clearanceNote - Why the cookie check settled (or did not settle) this round.
 * @param cookieSolvedAt - Time [ms] at which the first cookie change was held back, otherwise `undefined`.
 * @param now - The current time [ms].
 * @returns The (possibly adjusted) injection flag, the pending-hold timestamp, and what happened.
 */
export function PlanScriptInjection(cleared: boolean, clearanceNote: string, cookieSolvedAt: number | undefined, now: number): { cleared: boolean; cookieSolvedAt: number | undefined; action: ScriptInjectionAction } {
    if (cleared && clearanceNote === 'changed') {
        // Fresh cookie change on a still-challenged document: start (or continue) the hold,
        // keeping the deadline of the first change instead of pushing it further away.
        if (cookieSolvedAt === undefined) return { cleared: false, cookieSolvedAt: now, action: 'hold' };
        if (now - cookieSolvedAt >= COOKIE_CLEARANCE_DOM_GRACE) return { cleared: true, cookieSolvedAt: undefined, action: 'force' };
        return { cleared: false, cookieSolvedAt, action: 'hold' };
    }
    if (!cleared && cookieSolvedAt !== undefined && now - cookieSolvedAt >= COOKIE_CLEARANCE_DOM_GRACE) {
        // The document never replaced the challenge within the grace period: inject anyway
        // instead of waiting for the poller/window timeout (the pre-hold behaviour).
        return { cleared: true, cookieSolvedAt: undefined, action: 'force' };
    }
    // A DOM-cleared round injects immediately; everything else keeps waiting for the next poll.
    return { cleared, cookieSolvedAt, action: cleared ? 'inject' : 'wait' };
}

/**
 * Decides what the stalled-challenge check may do with a challenge document that currently
 * renders no control (see the caller in `ReloadStalledCloudFlareChallenge`).
 *
 * Takes the check's observations: `isChallenge` (the document is a challenge interstitial),
 * `hasRealWidget` (a control is rendered right now - never reload then), `widgetEverSeen`
 * (a control was rendered by an earlier check of this document), `age` (milliseconds the
 * current document has existed, undefined = unknown), `freshClearance` (this document issued
 * a new cf_clearance: Cloudflare rotates without redirecting, the documented stall) and
 * `remaining` (reloads left in the budget).
 * @returns `'reload'` to restart the document, `'defer'` while the document is younger than
 * `CHALLENGE_WIDGET_RENDER_GRACE` (a slow widget must not be reset), `'wait'` to keep watching
 * without reloading.
 */
export function PlanStalledChallengeReload(options: { isChallenge: boolean; hasRealWidget: boolean; widgetEverSeen: boolean; age: number | undefined; freshClearance: boolean; remaining: number }): 'reload' | 'defer' | 'wait' {
    if (options.remaining <= 0 || !options.isChallenge || options.hasRealWidget) return 'wait';
    if (!options.freshClearance && options.widgetEverSeen) return 'wait';
    if (typeof options.age !== 'number' || Number.isNaN(options.age) || options.age < CHALLENGE_WIDGET_RENDER_GRACE) return 'defer';
    return 'reload';
}

/**
 * Selectors covering the real interactive widgets across Cloudflare Turnstile
 * variants, reCAPTCHA and hCaptcha (the iframe/checkbox is the interactive
 * widget; hidden response inputs are always present and must NOT match).
 */
const ChallengeWidgetSelectors = [
    // Turnstile (various site-key/wrapper layouts)
    '.cf-turnstile iframe',
    'iframe[src*="challenges.cloudflare.com/turnstile"]',
    'iframe[src*="challenges.cloudflare.com"]',
    '#challenge-stage iframe',
    '#challenge-stage input[type="checkbox"]',
    '.challenge-form [type="checkbox"]',
    '#turnstile-wrapper iframe',
    '[data-turnstile-sitekey] iframe',
    'div[class*="turnstile"] iframe',
    'input[type="checkbox"][name="turnstile"]',
    // reCAPTCHA v2
    '.g-recaptcha iframe',
    'iframe[src*="recaptcha"]',
    '#recaptcha iframe',
    '[data-sitekey] iframe',
    // hCaptcha
    '.h-captcha iframe',
    'iframe[src*="hcaptcha"]',
].join(', ');

/**
 * DOM/body markers that identify a Cloudflare challenge interstitial page.
 */
const ChallengePageSelectors = [
    '.cf-turnstile',
    '#challenge-stage',
    '.challenge-form',
    '#turnstile-wrapper',
    '[data-turnstile-sitekey]',
    '.g-recaptcha',
    '#recaptcha',
    '.h-captcha',
    '[name="cf-turnstile-response"]',
].join(', ');

/**
 * Expression injected into the challenge page by both the stalled-reload check and the
 * Cloudflare detection script. It resolves to `{ widget, frames, dom, age, announce }`:
 *
 * - `widget`: a visible interactive control exists somewhere in this document — a Turnstile
 *   or captcha frame (matched by its source, in the light DOM, in a nested same-origin frame
 *   or inside a shadow root) or a rendered control (`input`, `label`, checkbox semantics,
 *   Turnstile wrapper). The interstitial reported on JapScan showed the clickable box while
 *   every selector above returned nothing, so the stalled-challenge reload kept resetting
 *   the very challenge the user was about to click.
 * - `frames`: number of child frames plus a compact inventory of every one of them (hidden
 *   ones marked), and any selector error — appended to the `[KUMO] poll#` trace. A widget
 *   the probes still miss identifies itself here instead of leaving a bare `widget=false`.
 * - `dom`: when no widget was found, a compact inventory of the challenge-looking elements
 *   (ids/classes carrying cf/chl/captcha/challenge/widget/overlay, controls, canvas/svg …, the
 *   ones sitting out of the layout marked) plus a shallow walk of the body, so the markup
 *   hosting the real control — or the leftover container proving `cf=true` is a false positive
 *   — shows up in the console dump.
 * - `age`: milliseconds since this document was created (`performance.now()`), used to hold
 *   the stalled reload back until the widget had time to render — Cloudflare and the site
 *   overlay inject their control a few seconds *after* the load, and reloading before that
 *   resets the proof phase (the `reload #1/3` loop).
 * - `announce`: what the page declares about a pending challenge before any control is
 *   rendered — the site's own flag (`window.__captcha`) and Cloudflare's boot options
 *   (`__cf_chl_opt`). It separates "challenge announced, widget not rendered yet" from "no
 *   challenge at all", which is what `widget=false` on a bare body could never tell.
 *
 * Exported so the unit tests can evaluate it against a fake DOM.
 */
export const CHALLENGE_WIDGET_PROBE = `(() => {
    const result = { widget: false, frames: '', dom: '', age: 0, announce: '' };
    try {
        result.age = Math.round(performance.now());
    } catch (error) {
        result.age = 0;
    }
    const boxOf = (node) => {
        try {
            const box = node.getBoundingClientRect();
            return box ? { width: box.width, height: box.height } : null;
        } catch (error) {
            return null;
        }
    };
    const visible = (box) => !!box && box.width > 0 && box.height > 0;
    const attribute = (node, name) => {
        try {
            return String(node.getAttribute(name) || '');
        } catch (error) {
            return '';
        }
    };
    const challengeSource = (node) => {
        const source = attribute(node, 'src').toLowerCase();
        return source.includes('challenges.cloudflare.com')
            || source.includes('turnstile')
            || source.includes('recaptcha')
            || source.includes('hcaptcha');
    };
    const nameOf = (node) => {
        let id = '';
        let classes = '';
        try {
            id = node.id ? '#' + String(node.id).slice(0, 30) : '';
            const raw = typeof node.className === 'string' ? node.className : '';
            classes = raw.trim() ? '.' + raw.trim().split(' ').filter(Boolean).slice(0, 2).join('.').slice(0, 40) : '';
        } catch (error) {
            id = '';
            classes = '';
        }
        return String(node.tagName || '?').toLowerCase() + id + classes;
    };
    const errors = [];
    // Every child frame of this document, hidden or not: a widget frame which never opens
    // (size 0) is as interesting as a missing one when the checkbox is on screen.
    let childFrames = -1;
    const inventory = [];
    try {
        const frames = Array.prototype.slice.call(document.querySelectorAll('iframe, frame, embed, object'));
        childFrames = frames.length;
        for (let index = 0; index < frames.length && inventory.length < 8; index++) {
            const box = boxOf(frames[index]);
            const size = Math.round(box ? box.width : 0) + 'x' + Math.round(box ? box.height : 0);
            inventory.push(size + (visible(box) ? ' ' + attribute(frames[index], 'src').slice(0, 60) : ' (hidden)'));
        }
    } catch (error) {
        errors.push('frames:' + error.message);
    }
    const visit = (root, depth) => {
        if (!root || result.widget || depth > 4) return;
        let nodes = [];
        try {
            nodes = Array.prototype.slice.call(root.querySelectorAll('iframe, frame, embed, object, input, label, [role="checkbox"], [class*="checkbox" i], [class*="turnstile" i], [id*="turnstile" i]'));
        } catch (error) {
            errors.push('sel:' + error.message);
            return;
        }
        for (let index = 0; index < nodes.length && !result.widget; index++) {
            const node = nodes[index];
            const box = boxOf(node);
            const tag = String(node.tagName || '').toUpperCase();
            if (tag === 'IFRAME' || tag === 'FRAME' || tag === 'EMBED' || tag === 'OBJECT') {
                // A hidden frame cannot host a clickable control: skip it entirely.
                if (!visible(box)) continue;
                if (challengeSource(node)) {
                    result.widget = true;
                    return;
                }
                let child = null;
                try {
                    child = node.contentDocument;
                } catch (error) {
                    child = null;
                }
                if (child) visit(child, depth + 1);
            } else if (visible(box)) {
                // A rendered control or Turnstile wrapper on the interstitial IS what the
                // user clicks: its markup is not covered by the selectors above.
                result.widget = true;
                return;
            }
        }
        if (result.widget || depth > 1) return;
        let all = [];
        try {
            all = Array.prototype.slice.call(root.querySelectorAll('*'));
        } catch (error) {
            errors.push('walk:' + error.message);
            return;
        }
        for (let index = 0; index < all.length && !result.widget; index++) {
            if (all[index] && all[index].shadowRoot) visit(all[index].shadowRoot, depth + 1);
        }
    };
    const describe = (root) => {
        const lines = [];
        try {
            const interesting = Array.prototype.slice.call(root.querySelectorAll('[id*="cf" i], [class*="cf" i], [id*="chl" i], [class*="chl" i], [id*="captcha" i], [class*="captcha" i], [id*="challenge" i], [class*="challenge" i], [id*="widget" i], [class*="widget" i], [id*="overlay" i], [class*="overlay" i], [class*="turnstile" i], [role="checkbox"], label, input, button, textarea, iframe, embed, object, canvas, svg, [src*="cloudflare" i], [src*="cdn-cgi" i], [href*="cdn-cgi" i]'));
            const visibleFirst = [];
            const hiddenRest = [];
            for (let index = 0; index < interesting.length; index++) {
                const box = boxOf(interesting[index]);
                if (!box) continue;
                // Hidden matches matter as much as visible ones: a challenge container which
                // sits in the DOM but out of the layout means isChallenge matched a solved
                // (or not yet rendered) interstitial — the false-positive hypothesis. Visible
                // entries are kept first so a common hidden form control never pushes the
                // rendered challenge markup out of the dump.
                const size = Math.round(box.width) + 'x' + Math.round(box.height);
                // The source tells WHICH resource an entry is: a script src pointing at
                // challenges.cloudflare.com proves the widget bootstrap was at least requested
                // (its absence means the Turnstile api.js never even arrived), which the bare
                // tag+size cannot say.
                const node = interesting[index];
                const ref = (node.getAttribute && (node.getAttribute('src') || node.getAttribute('href'))) || '';
                const entry = nameOf(node) + ' ' + size + (ref ? ' ' + String(ref).slice(0, 80) : '') + (visible(box) ? '' : ' (hidden)');
                if (visible(box)) {
                    visibleFirst.push(entry);
                } else {
                    hiddenRest.push(entry);
                }
                if (visibleFirst.length >= 14) break;
            }
            for (let index = 0; index < visibleFirst.length && lines.length < 14; index++) {
                lines.push(visibleFirst[index]);
            }
            for (let index = 0; index < hiddenRest.length && lines.length < 14; index++) {
                lines.push(hiddenRest[index]);
            }
            if (lines.length < 6) {
                const shallow = Array.prototype.slice.call(root.querySelectorAll('body > *, body > * > *'));
                for (let index = 0; index < shallow.length && lines.length < 18; index++) {
                    const box = boxOf(shallow[index]);
                    if (!visible(box)) continue;
                    const entry = nameOf(shallow[index]) + ' ' + Math.round(box.width) + 'x' + Math.round(box.height);
                    if (lines.indexOf(entry) === -1) lines.push(entry);
                }
            }
        } catch (error) {
            return 'ERR:' + error.message;
        }
        return lines.join(' | ');
    };
    // A positioned element covering most of the viewport IS the blocking challenge UI even
    // when it hosts no iframe and no form control: a site's own overlay (JapScan's security
    // page, the #jc-overlay node) is a plain positioned layer, which is why every selector
    // above misses it while the user is looking at something to click. Reloading that
    // document resets the control (the ReloadStalledCloudFlareChallenge reload loop), so a
    // covering layer counts as a widget, and names itself in "dom" for the console dump.
    const covering = (root) => {
        if (typeof window === 'undefined') return null;
        try {
            const width = window.innerWidth || document.documentElement.clientWidth || 0;
            const height = window.innerHeight || document.documentElement.clientHeight || 0;
            if (!width || !height) return null;
            const nodes = Array.prototype.slice.call(root.querySelectorAll('body *'));
            for (let index = 0; index < nodes.length; index++) {
                const node = nodes[index];
                const tag = String(node.tagName || '').toUpperCase();
                if (tag === 'BODY' || tag === 'HTML') continue;
                const box = boxOf(node);
                if (!visible(box)) continue;
                if (box.width < width * 0.4 || box.height < height * 0.4) continue;
                let position = '';
                try {
                    position = window.getComputedStyle(node).position || '';
                } catch (error) {
                    position = '';
                }
                if (position === 'fixed' || position === 'absolute' || position === 'sticky') return node;
            }
        } catch (error) {
            errors.push('overlay:' + error.message);
        }
        return null;
    };
    // What the page itself announces: the site sets a flag BEFORE rendering its own overlay,
    // and Cloudflare boots with an options object. The trace can then tell "challenge
    // announced but no control rendered yet" from "no challenge at all" — which decides
    // whether the window is waiting for a widget or stuck on a false positive.
    const announce = [];
    try {
        if (typeof window !== 'undefined') {
            if (window.__captcha) announce.push('captcha=' + String(window.__captcha.needed));
            if (window.__cf_chl_opt || window._cf_chl_opt) announce.push('cf-chl=1');
        }
    } catch (error) {
        announce.push('err=' + error.message);
    }
    result.announce = announce.join(' ');
    visit(document, 0);
    if (!result.widget) {
        const blocker = covering(document);
        if (blocker) {
            const box = boxOf(blocker);
            result.widget = true;
            result.dom = 'overlay ' + nameOf(blocker) + ' ' + Math.round(box ? box.width : 0) + 'x' + Math.round(box ? box.height : 0);
        } else {
            result.dom = describe(document);
        }
    }
    let head = 'child=' + childFrames;
    if (errors.length) head += ' err=' + errors.join(' ');
    if (inventory.length) head += ' ' + inventory.join(' | ');
    result.frames = head;
    return result;
})()`;

export abstract class FetchProvider {

    private featureFlags: FeatureFlags;

    protected async ValidateResponse(response: Response): Promise<void> {
        if (/challenge/i.test(response.headers.get('CF-Mitigated'))) {
            throw new Exception(R.FetchProvider_Fetch_CloudFlareChallenge, response.url);
        }
        if (/challenge/i.test(response.headers.get('X-Vercel-Mitigated'))) {
            throw new Exception(R.FetchProvider_Fetch_VercelChallenge, response.url);
        }
        if (response.status === 403) {
            throw new Exception(R.FetchProvider_Fetch_Forbidden, response.url);
        }
    }

    /**
     * ...
     */
    public Initialize(featureFlags: FeatureFlags): void {
        this.featureFlags = featureFlags;
    }

    /**
     * Performs the given {@link request} through the platform's native fetch. When Cloudflare
     * rejects the request (see also {@link FetchHTML}), the challenge is resolved through the
     * site's challenge window — the same flow the plugins use for their own extractions — and
     * the request is retried once.
     * @param request - ...
     */
    public async Fetch(request: Request): Promise<Response> {
        try {
            return await this.FetchCore(request);
        } catch (error) {
            if (IsCloudFlareChallengeError(error) && await this.RecoverFromChallenge(request)) {
                console.warn('[KUMO] Fetch: retrying after challenge recovery for', request.url);
                return await this.FetchCore(request);
            }
            throw error;
        }
    }

    /**
     * Performs the given {@link request} through the platform's native fetch (without challenge recovery).
     * @param request - ...
     */
    protected abstract FetchCore(request: Request): Promise<Response>;

    /** Origin → in-flight challenge recovery, so concurrent fetches join a single window. */
    readonly #challengeRecoveries = new Map<string, Promise<void>>();

    /** Origin → start time [ms] of the last recovery attempt (cooldown guard). */
    readonly #challengeRecoveryStamps = new Map<string, number>();

    /**
     * Resolves a Cloudflare challenge for the origin of the given {@link request} by opening the
     * site's challenge window and waiting until its script has been dispatched (i.e. the challenge
     * was solved, possibly by the user in the shown window).
     * @param request - The rejected request whose origin needs a fresh clearance.
     * @returns `true` when a recovery ran (or an in-flight one was joined) and the caller may
     * retry, `false` when recovery is not applicable (only GET requests, sites must opt in via
     * {@link ShouldUseForkChallengeHandling}, and the cooldown suppresses repeated attempts).
     */
    protected async RecoverFromChallenge(request: Request): Promise<boolean> {
        const method = request.method;
        const optedIn = ShouldUseForkChallengeHandling(request.url);
        if (method !== 'GET' || !optedIn) {
            // Without this line a declined recovery looked exactly like one that never ran: the
            // error surfaced with no trace of why no window opened (same gap as the cooldown above).
            console.warn(`[KUMO] Fetch: challenge recovery not applicable for ${request.url} (method=${method}, opted-in=${optedIn})`);
            return false;
        }
        const origin = new URL(request.url).origin;
        const inFlight = this.#challengeRecoveries.get(origin);
        if (inFlight) {
            await inFlight;
            return true;
        }
        if (Date.now() - (this.#challengeRecoveryStamps.get(origin) ?? 0) < CHALLENGE_RECOVERY_COOLDOWN) {
            // Without this line a cooldown-suppressed recovery looked exactly like a fetch that
            // never met a challenge: the error reached the UI with no trace of why no window opened.
            console.warn('[KUMO] Fetch: challenge recovery suppressed by cooldown for', origin);
            return false;
        }
        this.#challengeRecoveryStamps.set(origin, Date.now());
        // NOTE: The script is evaluated verbatim by `executeJavaScript` — it must be an
        // *expression* producing a structured-cloneable value. A function string such as
        // `'() => true'` evaluates to a Function object, which the IPC layer cannot clone
        // ("An object could not be cloned") and the recovery window would always fail.
        const recovery = this.FetchWindowScript(new Request(request.url), 'true', undefined, CHALLENGE_RECOVERY_BUDGET, false)
            .then(() => undefined)
            .catch((error: unknown) => console.warn('[KUMO] Fetch: challenge recovery failed for', origin, error))
            .finally(() => this.#challengeRecoveries.delete(origin));
        this.#challengeRecoveries.set(origin, recovery);
        await recovery;
        return true;
    }

    /**
     * Fetch and parse the remote HTML content into a virtual {@link Document} for further processing.
     * @param request - The request used to fetch the remote content.
     * @returns A virtual DOM with limited capabilities:
     *    - Since the document is detached it will not be rendered, therefore certain behavior may not be as expected (e.g., innerText is the same as textContent)
     *    - The document uses the base URL of the application instead of `request.url`, which affects all expanded links in the document
     */
    public async FetchHTML(request: Request): Promise<Document> {
        const mime = 'text/html';
        const charsetPattern = /charset=([\w-]+)/;

        for (let attempt = 0; ; attempt++) {
            const response = await this.Fetch(request);
            const data = await response.arrayBuffer();
            const content = new TextDecoder().decode(data);

            if (attempt === 0 && IsCloudFlareChallengePage(content) && await this.RecoverFromChallenge(request)) {
                // Cloudflare served its challenge page with a success status: recover through the
                // site's challenge window and fetch the real document instead of parsing the interstitial.
                console.warn('[KUMO] FetchHTML: challenge page detected, retrying after recovery for', request.url);
                continue;
            }

            let document = new DOMParser().parseFromString(content, mime);

            const charset = document.head?.querySelector<HTMLMetaElement>('meta[charset]')?.getAttribute('charset')
                || document.head?.querySelector<HTMLMetaElement>('meta[http-equiv="Content-Type"]')?.content?.match(charsetPattern)?.at(1)
                || response.headers?.get('Content-Type')?.match(charsetPattern)?.at(1)
                || 'UTF-8';

            document = /UTF-?8/i.test(charset) ? document : new DOMParser().parseFromString(new TextDecoder(charset).decode(data), mime);

            // NOTE: Monkey patching the `innerText` property, stripping whitespaces as it would be rendered when attached to window DOM
            const selectors = [ 'h1', 'h2', 'h3', 'h4', 'h5', 'div', 'span', 'a', 'li' ].join(', ');
            for (const element of document.body.querySelectorAll<HTMLElement>(selectors)) {
                Object.defineProperty(element, 'innerText', {
                    get: () => element.textContent?.replace(/\s+/g, ' ').trim()
                });
            }

            return document;
        }
    }

    /**
     * ...
     * @param request - ...
     */
    public async FetchJSON<T extends JSONElement>(request: Request): Promise<T> {
        const response = await this.Fetch(request);
        return response.json();
    }

    /**
     * ...
     * @param request - ...
     * @param query - ...
     */
    public async FetchCSS<T extends HTMLElement>(request: Request, query: string): Promise<T[]> {
        const dom = await this.FetchHTML(request);
        return [ ...dom.querySelectorAll(query) ] as T[];
    }

    /**
     * Perform a GraphQL request (POST) to a desired endpoint and returns JSON data.
     * @param operationName - The name of the query to be performed or `undefined` for unnamed queries
     * @param query - A valid GraphQL query
     * @param variables - A JSONObject containing the variables of the query.
     * @param extensions - ...
     */
    public async FetchGraphQL<T extends JSONElement>(request: Request, operationName: string, query: string | undefined, variables: JSONObject, extensions: JSONObject | undefined = undefined): Promise<T> {

        const graphQLRequest = new Request(request.url, {
            method: 'POST',
            body: JSON.stringify({ operationName, query, variables, extensions }),
            headers: {
                'Content-Type': 'application/json',
                'Accept': '*/*'
            },
        });

        // NOTE: Copy custom headers from parent request
        for (const header of request.headers) {
            graphQLRequest.headers.set(header.at(0), header.at(1));
        }

        type GraphQLResult = {
            errors: {
                code: number;
                message: string;
            }[];
            data: T;
        };

        const data = await this.FetchJSON<GraphQLResult>(graphQLRequest);
        if (data.errors && data.errors.length > 0) {
            throw new Exception(R.FetchProvider_FetchGraphQL_AggregateError, data.errors.map(error => error.message).join('\n'));
        }
        if (!data.data) {
            throw new Exception(R.FetchProvider_FetchGraphQL_MissingDataError);
        }
        return data.data;
    }

    /**
     * ...
     * @param request - ...
     * @param regex - ...
     */
    public async FetchRegex(request: Request, regex: RegExp): Promise<string[]> {
        if (regex.flags.indexOf('g') === -1) {
            throw new InternalError(`The provided RegExp must contain the global 'g' modifier!`);
        }
        const response = await fetch(request);
        const data = await response.text();
        const result: string[] = [];
        let match = undefined;
        while (match = regex.exec(data)) {
            result.push(match.at(1));
        }
        return result;
    }

    /**
     * Fetch and decode a protocol buffer message.
     * @param schema - The schema of the protocol buffer including all supported message definitions
     * @param messageTypePath - The name of the package and schema type separated by a `.` which should be used to decode the response
     * @returns The decoded response data
     */
    public async FetchProto<T extends JSONElement>(request: Request, schema: string, messageTypePath: string): Promise<T> {
        const response = await fetch(request);
        const serialized = new Uint8Array(await response.arrayBuffer());
        const prototype = protobuf.parse(schema, { keepCase: true }).root.lookupType(messageTypePath);
        return prototype.decode(serialized).toJSON() as T;
    }

    /*
    public async FetchXPATH(request: Request, xpath: string): Promise<Node[]> {
        const dom = await this.FetchHTML(request);
        const result = document.evaluate(xpath, dom, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        return new Array(result.snapshotLength).fill(null).map((_, index) => result.snapshotItem(index) as Node);
    }
    */

    /**
     * Scans the members of the given {@link payload} recursively, searching for the first occurence that fulfills the given {@link predicate}
     * and returns the corresponding value, or `undefined` if non was found.
     */
    #ExtractValueNextJS<T extends JSONElement>(payload: JSONElement, predicate: (data: JSONObject<JSONElement> | JSONArray<JSONElement>) => unknown): T {
        if (payload && typeof payload === 'object') {
            if (predicate(payload)) return payload as T;
            for (const value of Object.values(payload)) {
                const result = this.#ExtractValueNextJS<T>(value, predicate);
                if (result) return result;
            }
        }
        return undefined;
    }

    /**
     * Extract all NextJS hydrated flight data payloads from the HTML script tags of the provided {@link request}
     * and returns the first nested data element that fulfills the given {@link predicate} or `undefined` if non was found.
     * @remarks This is an extremely flakey extractor for NextJS flight data which needs much improvement for generic use.
     */
    public async FetchNextJS<T extends JSONElement>(request: Request, predicate: (data: JSONObject<JSONElement> | JSONArray<JSONElement>) => unknown): Promise<T | undefined> {
        const scripts = await this.FetchCSS<HTMLScriptElement>(request, 'script:not([src])');
        const payloads = scripts
            .map(script => script.text)
            .filter(script => script.includes('self.__next_f.push'))
            .map(script => {
                // TODO: Improve extraction robustness and variety (e.g., split line breaks into sub-scripts)
                try {
                    const content: string = JSON.parse(script.slice(script.indexOf(',"') + 1, -2));
                    return JSON.parse(content.slice(content.indexOf(':') + 1)) as JSONElement;
                } catch {
                    return {} as JSONElement;
                }
            });

        for (const payload of payloads) {
            const data: T = this.#ExtractValueNextJS<T>(payload, predicate);
            if (data) return data;
        }

        return undefined;
    }

    /**
     * Reads the (httpOnly) `cf_clearance` cookie for the given {@link url} through the CDP debugger,
     * since the cookie is never visible to `document.cookie`.
     * @returns The cookie value, an empty string when the cookie is absent, or `undefined` when the
     * debugger could not answer (not ready yet, window navigating or already destroyed). A short
     * timeout guards the caller: this runs on the critical DOMReady path, where a hanging debugger
     * command would stall the whole challenge classification.
     */
    private async ReadClearance(win: ReturnType<typeof CreateRemoteBrowserWindow>, url: string, timeout = 5_000): Promise<string | undefined> {
        try {
            const cookies = await Promise.race([
                win.SendDebugCommand<{ cookies: { name: string; value: string }[] }>('Network.getCookies', { urls: [ url ] }),
                new Promise<never>((_, reject) => setTimeout(() => reject(new Error('CDP getCookies timeout')), timeout)),
            ]);
            return cookies?.cookies?.find(cookie => cookie.name === 'cf_clearance')?.value ?? '';
        } catch {
            return undefined;
        }
    }

    /**
     * Polls a Cloudflare challenge page and reloads it when the challenge is "managed" (no real widget rendered)
     * and a cf_clearance cookie is already present. This works around stalls where the page stays on
     * "Just a moment..." indefinitely because the invisible challenge never auto-resolves.
     * @param baseline - The clearance that was already present when the current document became ready;
     * only a value differing from it (a clearance issued by this document) triggers a reload.
     */
    private async ReloadStalledCloudFlareChallenge(
        win: ReturnType<typeof CreateRemoteBrowserWindow>,
        url: string,
        budget: { remaining: number; lastReloadedClearance: string; reloadInFlight: boolean },
        invocations: { name: string; info: string }[],
        baseline?: string
    ): Promise<() => void> {
        const maxReloads = 3;
        const interval = 5000;
        let stopped = false;
        let clearanceBaseline = baseline;
        let reloadCount = 0;

        const checkScript = `
            (() => {
                const title = (document.title || '').toLowerCase();
                const bodyText = (document.body?.innerText || '').toLowerCase();
                // Cloudflare serves the interstitial localized (FR here): normalize the
                // accents so the French markers match like 'just a moment' does.
                const plainText = bodyText.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
                const titleHit = title.includes('just a moment') || title.includes('un instant');
                const bodyHit = bodyText.includes('checking your browser')
                    || bodyText.includes('verify you are human')
                    || bodyText.includes('attention required')
                    || plainText.includes('verifiez que vous etes humain')
                    || plainText.includes('verification de securite en cours');
                // Which structural selector matched, if any: the trace has to tell a real
                // interstitial from a page still carrying a leftover, hidden container.
                const selectorHit = '${ChallengePageSelectors}'.split(',').map(part => part.trim()).find(part => {
                    try {
                        return !!document.querySelector(part);
                    } catch (error) {
                        return false;
                    }
                }) || '';
                const isChallenge = titleHit || bodyHit || !!selectorHit;
                const why = [ titleHit && 'title', bodyHit && 'body', selectorHit && 'sel:' + selectorHit ].filter(Boolean).join('+');
                // The clickable Turnstile checkbox ("Vérifiez que vous êtes humain") can be
                // rendered outside the interstitial markup above (JapScan's security page):
                // without the deep probe the page looked widget-less, so the stalled-challenge
                // reload kept resetting the very challenge the user was about to click,
                // while Cloudflare rotated cf_clearance on every load (false "solved" signal).
                // The probe walks nested frames/shadow roots and is only paid when this
                // document really is a challenge; its frame/element inventory feeds the poll
                // trace, and "age" tells how long this document has existed (see the render
                // grace in doCheck below).
                const probe = isChallenge ? ${CHALLENGE_WIDGET_PROBE} : { widget: false, frames: '', dom: '', age: 0, announce: '' };
                return {
                    isChallenge,
                    hasRealWidget: probe.widget || !!document.querySelector('${ChallengeWidgetSelectors}'),
                    frames: probe.frames,
                    dom: probe.dom,
                    age: probe.age,
                    announce: probe.announce,
                    why
                };
            })()
        `;

        // Set as soon as one check observes a rendered control: from then on a reload could reset
        // a challenge the user is interacting with, so only the documented fresh-clearance stall
        // may restart the document (reason (b) below). Scoped to the current document: a control
        // seen on a replaced document says nothing about what the user can click here.
        let widgetEverSeen = false;
        let lastAge: number | undefined = undefined;

        const doCheck = async () => {
            if (stopped || budget.remaining <= 0 || budget.reloadInFlight) return;
            try {
                const result = await win.ExecuteScript<{
                    isChallenge: boolean;
                    hasRealWidget: boolean;
                    frames?: string;
                    dom?: string;
                    age?: number;
                }>(checkScript);

                // The probe's age is the current document's own clock (performance.now), so it
                // goes back on every navigation - including the reloads issued below.
                if (typeof result?.age === 'number') {
                    if (lastAge !== undefined && result.age < lastAge) widgetEverSeen = false;
                    lastAge = result.age;
                }
                if (result?.hasRealWidget) widgetEverSeen = true;

                if (result?.isChallenge && !result?.hasRealWidget) {
                    // Two independent reasons to restart the document, both still gated by the
                    // render grace (see PlanStalledChallengeReload):
                    //  (a) NO control was ever rendered here. Once the render grace has elapsed
                    //      there is nothing a reload could reset, so the reload is deterministic.
                    //      The previous gate relied solely on a fresh cf_clearance, which on
                    //      JapScan alternates between two cookie values (trace `clr=reappeared`)
                    //      and therefore matched only about half of the checks - the reload never
                    //      fired at all (trace `nav=0` on a 20 s old challenge document).
                    //  (b) the documented stall: this document issued a NEW cf_clearance while
                    //      staying on the challenge (Cloudflare rotates without redirecting).
                    let clearance = '';
                    let freshClearance = false;
                    if (widgetEverSeen) {
                        // NOTE: `cf_clearance` is httpOnly, so `document.cookie` can never see it.
                        // Read the cookie through the debugger (CDP) instead - same session, httpOnly visible.
                        const read = await this.ReadClearance(win, url);
                        if (read === undefined) {
                            // Debugger not ready (navigation just happened): retry on the next cycle
                            // instead of falling back to a baseline-less (and thus harmful) reload.
                            return;
                        }
                        if (clearanceBaseline === undefined) {
                            // First successful read establishes the baseline for this document.
                            clearanceBaseline = read;
                            return;
                        }
                        clearance = read;
                        freshClearance = !!read && read !== clearanceBaseline && read !== budget.lastReloadedClearance;
                    }
                    const plan = PlanStalledChallengeReload({
                        isChallenge: result.isChallenge,
                        hasRealWidget: !!result.hasRealWidget,
                        widgetEverSeen,
                        age: result.age,
                        freshClearance,
                        remaining: budget.remaining
                    });
                    if (plan === 'defer') {
                        const age = typeof result.age === 'number' ? `${result.age}ms` : 'unknown';
                        console.warn(`[KUMO] ReloadStalledCloudFlareChallenge: deferred, challenge document is only ${age} old (waiting ${CHALLENGE_WIDGET_RENDER_GRACE}ms for the widget to render) for`, url);
                        invocations.push({ name: 'ReloadStalledCloudFlareChallenge', info: `deferred: document age ${age} < ${CHALLENGE_WIDGET_RENDER_GRACE}ms render grace` });
                        return;
                    }
                    if (plan === 'reload') {
                        budget.remaining--;
                        budget.lastReloadedClearance = clearance;
                        budget.reloadInFlight = true;
                        reloadCount++;
                        const age = typeof result.age === 'number' ? `${result.age}ms` : 'unknown';
                        invocations.push({
                            name: 'ReloadStalledCloudFlareChallenge',
                            info: `Reload #${reloadCount}/${maxReloads} (managed challenge, no widget, age ${age}${freshClearance ? ', fresh cf_clearance' : ''})`
                        });
                        console.warn(`[KUMO] ReloadStalledCloudFlareChallenge: reload #${reloadCount}/${maxReloads} (no control rendered for ${age}) for`, url);
                        try {
                            await win.ExecuteScript('window.location.reload()');
                        } finally {
                            budget.reloadInFlight = false;
                        }
                    }
                }
            } catch {
                // Ignore errors from ExecuteScript on a navigating/closed window
            }
        };

        let timeoutId: number;
        let scheduleAttempt = 0;
        const schedule = async () => {
            await doCheck();
            if (stopped) return;
            if (budget.remaining > 0) {
                // Back off exponentially (5s → 10s → 20s → … capped at 1 min) instead of
                // hammering the window on a fixed 5s interval, so a slow managed challenge
                // is given time to resolve without spinning the CPU.
                timeoutId = await SetTimeout(schedule, BackoffDelay(scheduleAttempt++, interval, 60_000));
            } else if (reloadCount > 0) {
                // Explain the silence: the budget is spent, so nobody watches the challenge any
                // more and the window is left to the poller/manual intervention.
                console.warn(`[KUMO] ReloadStalledCloudFlareChallenge: reload budget exhausted (${maxReloads}/${maxReloads}), the challenge stays for`, url);
                invocations.push({ name: 'ReloadStalledCloudFlareChallenge', info: `budget exhausted (${maxReloads}/${maxReloads}), giving up` });
            }
        };
        timeoutId = await SetTimeout(schedule, interval);

        return () => {
            stopped = true;
            if (timeoutId) ClearTimeout(timeoutId);
        };
    }

    /**
     * Polls a window that was shown for an Interactive challenge until the challenge clears,
     * then runs the extraction script on the now-usable page. Used when the challenge resolves
     * in place (no navigation) — e.g. JapScan's own `#jc-overlay` puzzle — so `DOMReady` never
     * fires again and the script would otherwise never run.
     */
    private async PollForChallengeResolution(
        win: ReturnType<typeof CreateRemoteBrowserWindow>,
        url: string,
        cloudflareDetectionScript: string,
        runScript: () => Promise<void>,
        isSettled: () => boolean,
        stopPollers: (() => void)[],
        invocations: { name: string; info: string }[],
        baseline?: string
    ): Promise<void> {
        let pollerId: number;
        const stop = () => {
            if (pollerId) ClearTimeout(pollerId);
        };
        stopPollers.push(stop);

        let pollAttempts = 0;
        // `cf_clearance` already present when this challenge started (a persisted,
        // re-injected cookie — see CLOUDFLARE.md §6). Such a value can never prove the
        // challenge was solved: the challenged request already carried it, so its mere
        // presence is not a resolution signal. `undefined` means "baseline not read yet";
        // only a clearance issued from here on (a genuine change) may clear the poller.
        // Without this baseline the first CDP read always looked like a "change" and
        // `runScript()` fired while the user was still solving the challenge, closing
        // the window mid-validation (the CrunchyScan reload bug, same root cause).
        // The caller passes the value read at DOMReady (same source as
        // `ReloadStalledCloudFlareChallenge`): `''` means "read fine, no cookie yet" — a
        // clearance appearing later is then a genuine change. `undefined` (the read failed)
        // leaves the baseline unset so the first successful read below establishes it.
        let lastClearance: string | undefined = typeof baseline === 'string' ? NormalizeClearance(baseline) : undefined;
        // Every clearance this poller has read so far: a value which cycles back (several
        // `cf_clearance` cookies scoped to the same URL can alternate between two CDP reads)
        // must be told apart from a genuinely new one, otherwise every round looks like a solve.
        const seenClearances = new Set<string>(lastClearance ? [lastClearance] : []);
        // Time [ms] at which a `cf_clearance` change was held back because the challenge document
        // was still current; drives the bounded wait in `PlanScriptInjection`.
        let cookieSolvedAt: number | undefined;
        // `age` of the previous round: when it goes down the document was replaced (site-side
        // navigation or self-reload) and not by us — see `cfNav` in the poll trace.
        let lastDocumentAge: number | undefined;
        let navigations = 0;
        const MAX_POLL_ATTEMPTS = 40;
        const poll = async () => {
            if (isSettled()) return;
            if (++pollAttempts > MAX_POLL_ATTEMPTS) {
                console.warn("[KUMO] PollForChallengeResolution: max attempts reached for", url);
                return;
            }
            let cleared = false;
            // Which of the two conditions below is holding the round back, logged every
            // round. This loop is the only gate between "the user solved the challenge"
            // and the extraction script starting, and it used to be completely silent:
            // a poller that never concluded left Media.Update() hanging until the 300 s
            // task timeout with nothing in the log to explain why (Volume 22, 28 sept.).
            let cfIsChallenge = '-', cfWidget = '-', siteState = '-', clearanceNote = '-', cfFrames = '-', cfDom = '-', cfAge = '-', cfWhy = '-', cfAnnounce = '-', cfNav = '-', cfCdpFrames = '-';
            try {
                const cloudflare = await win.ExecuteScript<{ isChallenge: boolean; hasRealWidget: boolean; frames?: string; dom?: string; age?: number; announce?: string; why?: string }>(cloudflareDetectionScript);
                cfIsChallenge = String(cloudflare?.isChallenge);
                cfWidget = String(cloudflare?.hasRealWidget);
                // Inventory of the frames and of the visible challenge-looking elements: it is
                // the only way a widget the probes still miss can identify itself in the console
                // dump (it is what turned `widget=false` on JapScan's clickable checkbox into a
                // diagnosable fact instead of a bare boolean).
                cfFrames = cloudflare?.frames ? cloudflare.frames : '-';
                cfDom = cloudflare?.dom ? cloudflare.dom : '-';
                cfAge = typeof cloudflare?.age === 'number' ? String(cloudflare.age) : '-';
                // `why` = which marker made `cf=true` (title/body/selector), `announce` = what the
                // page announces about a pending challenge (site flag, Cloudflare options object).
                // Together they separate a real interstitial from a false positive on a page that
                // merely carries leftover challenge markup, and "announced, not rendered yet"
                // from "no challenge at all".
                cfWhy = cloudflare?.why ? cloudflare.why : '-';
                cfAnnounce = cloudflare?.announce ? cloudflare.announce : '-';
                // `age` shrinking means the document restarted underneath us: a self-reload (the
                // site's own navigation, not ours). Counted so a reload loop caused by the site
                // is never mistaken for one of ours.
                const documentAge = typeof cloudflare?.age === 'number' ? cloudflare.age : undefined;
                if (documentAge !== undefined) {
                    if (lastDocumentAge !== undefined && documentAge < lastDocumentAge) navigations++;
                    lastDocumentAge = documentAge;
                }
                cfNav = String(navigations);
                // The DOM inventory (`frames=`) only sees frames reachable from the document:
                // Turnstile can host its widget inside a shadow root, which no querySelector
                // reaches, so a frame present in the tree while `child=0` would prove the probes
                // are blind to a control that may well be clickable on screen (reloading it then
                // resets exactly what the user is about to click). Ask the debugger for the real
                // frame tree instead of trusting the DOM walk alone.
                if (cfIsChallenge === 'true' && cfWidget === 'false') {
                    try {
                        const tree: unknown = await win.SendDebugCommand<JSONElement>('Page.getFrameTree');
                        const urls: string[] = [];
                        const collect = (node: unknown) => {
                            const entry = node as { frame?: { url?: string }; childFrames?: unknown[] };
                            const href = entry?.frame?.url;
                            if (href && href !== 'about:blank' && urls.indexOf(href) === -1) urls.push(href);
                            for (const child of entry?.childFrames ?? []) collect(child);
                        };
                        collect((tree as { frameTree?: unknown } | undefined)?.frameTree);
                        cfCdpFrames = urls.length ? urls.slice(0, 4).map(href => href.slice(0, 70)).join(' | ') : 'none';
                    } catch (error) {
                        cfCdpFrames = 'err:' + (error?.message ?? error);
                    }
                }
                // A Turnstile widget disappearing from the DOM means the challenge was solved,
                // even if residual challenge text remains in the body (e.g. MangaFire).
                // Do not treat a challenge with no detectable widget as solved immediately:
                // CrunchyScan renders Turnstile in a child frame, while JapScan may render its
                // own overlay asynchronously. The cookie check below is the authoritative signal.
                const widgetGone = cloudflare?.isChallenge && !cloudflare?.hasRealWidget && !/crunchyscan\.org|japscan\./i.test(url);
                // Always run site-specific detection (JapScan overlay, CrunchyScan subframe, etc.)
                const antiScraping = await CheckAntiScrapingDetection(win, url);
                siteState = String(FetchRedirection[antiScraping]);
                // Turnstile widget gone = CF solved. Site detection resolved = site own challenge solved.
                cleared = widgetGone || cloudflare?.isChallenge !== true && antiScraping === FetchRedirection.None;
                // Subframe / interactive Turnstile: DOM parent may never see the widget cleared.
                // Detect resolution via cf_clearance cookie change through CDP, with a short
                // timeout so we never block the loading screen if the debugger is not ready.
                if (!cleared) {
                    // Retry the CDP cookie read with backoff: the debugger is often not
                    // ready right after the window opens, and a transient failure must not
                    // cost the whole poll cycle.
                    for (let attempt = 0; attempt < 3 && !cleared; attempt++) {
                        // `undefined` = the read itself failed (retry); '' = read fine, no cookie.
                        const current = await this.ReadClearance(win, url, 5_000);
                        if (current === undefined) {
                            clearanceNote = 'read-failed';
                            if (attempt < 2) await Delay(BackoffDelay(attempt, 500, 2_000));
                            continue;
                        }
                        const firstRead = lastClearance === undefined;
                        const next = NextClearanceState(lastClearance, current, seenClearances);
                        lastClearance = next.baseline;
                        if (firstRead) {
                            // Whatever was already there proves nothing (see `lastClearance`).
                            invocations.push({ name: 'CfClearanceBaseline', info: `baseline established (present=${next.baseline.length > 0})` });
                            clearanceNote = `baseline:${next.baseline.length}`;
                            break; // Nothing can be "changed" until a later read.
                        }
                        if (next.changed) {
                            if (next.reappeared) {
                                // Churn, not a solve: the value cycled back to one this poller
                                // already read. It neither clears the round nor starts a hold, and
                                // the trace shows it as `clr=reappeared`.
                                clearanceNote = 'reappeared';
                            } else {
                                cleared = true;
                                clearanceNote = 'changed';
                                invocations.push({ name: 'CfClearanceDetected', info: `cf_clearance cookie changed via CDP, challenge resolved` });
                            }
                            break;
                        }
                        // Unchanged: keep waiting for a genuine new clearance.
                        clearanceNote = `unchanged:${current.length}`;
                        if (attempt < 2) await Delay(BackoffDelay(attempt, 500, 2_000));
                    }
                } else {
                    clearanceNote = 'skipped';
                }
            } catch (error) {
                clearanceNote = `error:${error?.message ?? error}`;
                if (error?.message?.includes("Failed to find window") || pollAttempts > 5) {
                    console.warn("[KUMO] PollForChallengeResolution: stopping poller for", url, error?.message);
                    return;
                }
            } finally {
                // `cf`/`widget` = Cloudflare's own detection, `site` = the connector's
                // (None/Automatic/Interactive), `clr` = why the cookie check did or did
                // not settle it (`reappeared` = a value cycling back between reads, churn
                // rather than a solve), `cleared` = whether the extraction script was started.
                // `frames`/`age` = what the widget probe saw in the challenge document (child
                // frames + their sources, milliseconds since the load); `cdpFrames` = the same
                // question asked to the debugger, which reaches frames no DOM query can see;
                // `why` = the marker which
                // made `cf=true`, `announce` = the pending-challenge flags the page declares, `nav`
                // = how often the document restarted on its own so far; `dom` joins only while
                // no widget is found, and lists the challenge-looking elements — hidden ones are
                // marked, that dump is what identifies the markup hosting the real control.
                const diagnostic = cfIsChallenge === 'true'
                    ? ` frames=${cfFrames} age=${cfAge} nav=${cfNav} why=${cfWhy} announce=${cfAnnounce}${cfWidget === 'false' ? ` dom=${cfDom}` : ''}${cfWidget === 'false' && cfCdpFrames !== '-' ? ` cdpFrames=${cfCdpFrames}` : ''}`
                    : '';
                console.warn(`[KUMO] poll#${pollAttempts} cf=${cfIsChallenge} widget=${cfWidget}${diagnostic} site=${siteState} clr=${clearanceNote} cleared=${cleared}`);
            }
            // A genuine cookie change can still point at the challenge document (navigation not
            // committed yet, overlay removed in place moments later, or a change caused by a
            // previous window's solve): hold the script back until the real page is current.
            const plan = PlanScriptInjection(cleared, clearanceNote, cookieSolvedAt, Date.now());
            if (plan.action === 'hold') {
                console.warn('[KUMO] poll: cf_clearance changed but the challenge is still the current document, waiting for it to be replaced for', url);
                invocations.push({ name: 'CfClearanceHold', info: `cf_clearance changed while the challenge page was still loaded, waiting up to ${COOKIE_CLEARANCE_DOM_GRACE}ms for the navigation` });
            } else if (plan.action === 'force') {
                console.warn('[KUMO] poll: the challenge document was never replaced within the grace period, injecting the script anyway for', url);
                invocations.push({ name: 'CfClearanceGraceExpired', info: `challenge still current ${COOKIE_CLEARANCE_DOM_GRACE}ms after the cf_clearance change, injecting anyway` });
            }
            cleared = plan.cleared;
            cookieSolvedAt = plan.cookieSolvedAt;
            if (cleared) {
                invocations.push({ name: "ChallengeResolved", info: "Interactive challenge cleared, running extraction script" });
                try {
                    await runScript();
                } catch (error) {
                    console.warn('[KUMO] challenge resolution script failed:', error);
                }
                return;
            }
            if (isSettled()) return;
            pollerId = await SetTimeout(poll, BackoffDelay(pollAttempts, 2000, 10_000));
        };
        pollerId = await SetTimeout(poll, 4000);
    }

    private async FetchWindowPreloadScriptUpstream<T extends void | JSONElement>(request: Request, preload: string, script: string, delay = 0, timeout = 60_000): Promise<T> {
        const invocations: {
            name: string;
            info: string;
        }[] = [];

        const win = CreateRemoteBrowserWindow();
        let destroyed = false;

        const destroy = async (reason = 'unspecified') => {
            if (destroyed) return;
            destroyed = true;
            // See the fork variant: the reason tells which path closed the window, which the
            // `Failed to find window with id N` of a poller can never do by itself.
            console.warn(`[KUMO] FetchWindow: closing window (${reason}) for`, request?.url);
            try {
                if (this.featureFlags.VerboseFetchWindow.Value) {
                    console.log('FetchWindow()::invocations', invocations);
                } else {
                    await win.Close();
                }
            } catch (error) {
                console.warn(error);
            }
        };

        return new Promise<T>(async (resolve, reject) => {
            let cancellation = await SetTimeout(async () => {
                await destroy('fetch timeout');
                reject(new Exception(R.FetchProvider_FetchWindow_TimeoutError));
            }, timeout);

            win.DOMReady.Subscribe(async () => {
                invocations.push({ name: 'DOMReady', info: `Window: ${win}` });
                try {
                    const redirect = await CheckAntiScrapingDetection(win, request.url);
                    invocations.push({ name: 'performRedirectionOrFinalize()', info: `Mode: ${FetchRedirection[ redirect ]}` });
                    switch (redirect) {
                        case FetchRedirection.Interactive:
                            ClearTimeout(cancellation);
                            cancellation = await SetTimeout(() => {
                                destroy('interactive timeout (150s)');
                                reject(new Exception(R.FetchProvider_FetchWindow_TimeoutError));
                            }, 150_000);
                            await win.Show();
                            break;
                        case FetchRedirection.Automatic:
                            break;
                        default:
                            ClearTimeout(cancellation);
                            await Delay(delay);
                            const result = await win.ExecuteScript<T>(script);
                            await destroy('script settled');
                            resolve(result);
                    }
                } catch (error) {
                    await destroy(`classification failed: ${error?.message ?? error}`);
                }
            });

            invocations.push({ name: 'Open', info: `Request URL: ${request.url}` });
            try {
                await win.Open(request, this.featureFlags.VerboseFetchWindow.Value, preload);
            } catch (error) {
                await destroy(`open failed: ${error?.message ?? error}`);
                ClearTimeout(cancellation);
                reject(error);
            }
        });
    }

    /**
     * Open the given {@link request} in a new browser window and inject the given {@link script}.
     * @param request - ...
     * @param script - The JavaScript or function that will be evaluated within the browser window
     * @param delay - The time [ms] to wait after the window was fully loaded and before the {@link script} will be injected
     * @param timeout - The maximum time [ms] to wait for the result before a timeout error is thrown (excluding the {@link delay})
     */
    public async FetchWindowScript<T extends void | JSONElement>(request: Request, script: string, delay?: number, timeout?: number, show = false): Promise<T> {
        return this.FetchWindowPreloadScript<T>(request, ``, script, delay, timeout, show);
    }

    /**
     * Open the given {@link request} in a new browser window and inject the given {@link script}.
     * @param request - ...
     * @param preload - The JavaScript or function that will be evaluated within the browser window before page is loaded
     * @param script - The JavaScript or function that will be evaluated within the browser window
     * @param delay - The time [ms] to wait after the window was fully loaded and before the {@link script} will be injected
     * @param timeout - The maximum time [ms] to wait for the result before a timeout error is thrown (excluding the {@link delay})
     */
    public async FetchWindowPreloadScript<T extends void | JSONElement>(request: Request, preload: string, script: string, delay = 0, timeout = 60_000, show = false): Promise<T> {
        if (!ShouldUseForkChallengeHandling(request.url)) {
            return this.FetchWindowPreloadScriptUpstream(request, preload, script, delay, timeout);
        }

        const invocations: {
            name: string;
            info: string;
        }[] = [];

        const win = CreateRemoteBrowserWindow();
        let destroyed = false;
        /** Injection attempts of the script: only the latest one may settle the request. */
        let scriptAttempts = 0;
        /** `true` while an attempt is waiting inside `ExecuteScript`. */
        let scriptInFlight = false;
        /** Set when a main-frame navigation tore down the document an attempt was running in. */
        let redispatchOnNextDomReady = false;

        win.BeforeWindowNavigate.Subscribe(async uri => {
            invocations.push({ name: 'BeforeNavigate', info: `URL: ${uri.href}` });
            if (scriptInFlight) {
                // A navigation destroys the execution context the script is running in: its
                // `ExecuteScript` then never settles and the caller hangs until its budget
                // expires (observed on JapScan, where the site navigates a few seconds after
                // the clearance is issued — right in the middle of the page extraction).
                // Remember it so the next DOMReady can dispatch the script again on the
                // document which replaces this one.
                redispatchOnNextDomReady = true;
                console.warn(`[KUMO] runScript: main frame navigated to ${uri.href} while attempt=${scriptAttempts} was pending`);
            }
            return null;
        });

        const stopPollers: (() => void)[] = [];
        // CrunchyScan's managed challenge can issue a fresh but unusable clearance on
        // every reload. Allow one automatic retry only, then leave the window stable for
        // a manual intervention instead of showing a visible challenge loop.
        const reloadBudget = {
            remaining: /crunchyscan\.org/i.test(request.url) ? 1 : 3,
            lastReloadedClearance: '',
            reloadInFlight: false,
        };
        // `cf_clearance` value that was already present when the current document became
        // ready (re-baselined on every navigation in the DOMReady handler below).
        // Reloading with an UNCHANGED cookie can never unblock anything — the request that
        // produced the challenge already carried it, so Cloudflare just re-serves the same
        // page — but the reload RESETS an in-progress Turnstile, which is exactly the
        // visible "flash loop" reported on CrunchyScan (and it silently voids a validation
        // the user is about to complete by hand). Only a clearance issued by the CURRENT
        // document (the real "solved but never redirected" stall) may trigger a reload ONCE
        // A CONTROL HAS BEEN SEEN; when nothing was ever rendered there is no Turnstile to
        // reset and the age gate alone decides (see PlanStalledChallengeReload).
        let clearanceBaseline: string | undefined;

        const destroy = async (reason = 'unspecified') => {
            if (destroyed) return;
            destroyed = true;
            // Which path closed the window: `Failed to find window with id N` in the poller
            // trace says the window vanished, never why. A fetch timeout, a settled script
            // (extraction done) and a crash are three completely different stories for the
            // caller, and the console was silent about all of them.
            console.warn(`[KUMO] FetchWindow: closing window (${reason}) for`, request?.url);
            try {
                for (const stop of stopPollers) {
                    stop();
                }
                stopPollers.length = 0;
                if (this.featureFlags.VerboseFetchWindow.Value) {
                    console.log('FetchWindow()::invocations', invocations);
                } else {
                    await win.Close().catch(() => {});
                }
            } catch (error) {
                console.warn(error);
            }
        };

        return new Promise<T>(async (resolve, reject) => {
            let settled = false;

            let cancellation = await SetTimeout(async () => {
                settled = true;
                await destroy('fetch timeout');
                reject(new Exception(R.FetchProvider_FetchWindow_TimeoutError));
            }, timeout);

            const runScript = async () => {
                if (settled) return;
                settled = true;
                const attempt = ++scriptAttempts;
                scriptInFlight = true;
                const startedAt = Date.now();
                // Announce the injection: when a reader timeout leaves no `[JapScan]` line behind,
                // this tells whether the extraction script was ever executed or never reached.
                console.warn(`[KUMO] runScript: executing attempt=${attempt} for`, request?.url);
                try {
                    // Some readers (e.g. JapScan) only paint their pages once the window is
                    // actually visible (IntersectionObserver/lazy loaders pause in a hidden
                    // window). Show the window before running the extraction script.
                    if (show) {
                        await win.Show();
                        await Delay(1500);
                    }
                    await Delay(delay);
                    console.warn(`[KUMO] runScript: inject attempt=${attempt} after ${Date.now() - startedAt}ms for`, request?.url);
                    const result = await win.ExecuteScript<T>(script);
                    if (attempt !== scriptAttempts) {
                        // A newer attempt took over after a navigation: this result belongs to a
                        // document which no longer exists and must not settle the request.
                        console.warn(`[KUMO] runScript: attempt=${attempt} superseded, discarding its result for`, request?.url);
                        return;
                    }
                    scriptInFlight = false;
                    console.warn(`[KUMO] runScript: returned attempt=${attempt} after ${Date.now() - startedAt}ms for`, request?.url);
                    ClearTimeout(cancellation);
                    await destroy(`script settled attempt=${attempt}`);
                    resolve(result);
                } catch (error) {
                    if (attempt !== scriptAttempts) {
                        console.warn(`[KUMO] runScript: attempt=${attempt} superseded, discarding its failure for`, request?.url);
                        return;
                    }
                    scriptInFlight = false;
                    if (redispatchOnNextDomReady) {
                        // The navigation killed the script's context mid-flight (Electron settles
                        // the pending `ExecuteScript` either never or with a frame-disposed error).
                        // Keep the request pending: the next DOMReady re-dispatches the script on
                        // the document which replaces this one, instead of failing a chapter whose
                        // new document is already loading.
                        console.warn(`[KUMO] runScript: attempt=${attempt} interrupted by navigation, waiting for the new document for`, request?.url, error?.message || error);
                        return;
                    }
                    ClearTimeout(cancellation);
                    await destroy(`script failed attempt=${attempt}: ${error?.message ?? error}`);
                    if (error?.message?.includes("Failed to find window")) {
                        console.warn("[KUMO] runScript: window already destroyed, resolving empty for", request?.url);
                        resolve(undefined as T);
                    } else {
                        console.warn("[KUMO] runScript error:", request?.url, error?.message || error);
                        reject(error);
                    }
                }
            };

            win.DOMReady.Subscribe(async () => {
                invocations.push({ name: 'DOMReady', info: `Window: ${win}` });
                // A navigation creates a new DOMReady while the previous challenge poller may
                // still be waiting. Keep only the poller for the current document; otherwise
                // several reload timers race and make CrunchyScan appear to loop forever.
                for (const stop of stopPollers) {
                    stop();
                }
                stopPollers.length = 0;

                // The document was replaced while an injection was pending (flagged by the
                // `BeforeWindowNavigate` subscription above): the old attempt runs in a context
                // which no longer exists and its `ExecuteScript` may hang forever. Unlock the
                // flow below — challenge detection, grace re-check, `runScript` — so the script
                // is dispatched again on the document which has just loaded, instead of waiting
                // for a result that can never arrive.
                if (redispatchOnNextDomReady) {
                    redispatchOnNextDomReady = false;
                    scriptInFlight = false;
                    settled = false;
                    invocations.push({ name: 'ScriptRecovery', info: `Document replaced while attempt=${scriptAttempts} was pending, re-dispatching` });
                    console.warn(`[KUMO] runScript: document replaced while attempt=${scriptAttempts} was pending, re-dispatching for`, request?.url);
                }

                // Re-baseline the clearance for the document that just loaded (before any
                // challenge detection delay), so only a clearance issued from here on can
                // authorize a reload — see `clearanceBaseline`.
                clearanceBaseline = await this.ReadClearance(win, request.url);

                let redirect: FetchRedirection;

                // Only wait for managed-challenge auto-resolution on sites that opt into stalled-challenge
                // reload. Other sites do not pay this latency penalty.
                if (ShouldReloadStalledChallenge(request.url)) {
                    await Delay(2500);
                }

                // The challenge may auto-resolve (and thus navigate) right around the grace delay, which
                // tears down the execution context and makes `ExecuteScript` fail. Poll the read-only
                // Cloudflare check until the page settles instead of giving up on the first navigation race.
                const cloudflareDetectionScript = `
                    (() => {
                        const title = (document.title || '').toLowerCase();
                        const body = (document.body?.innerText || '').toLowerCase();
                        // Cloudflare serves the interstitial localized (FR here): normalize the
                        // accents so the French markers match like 'just a moment' does.
                        const plain = body.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
                        const titleHit = title.includes('just a moment') || title.includes('un instant');
                        const bodyHit = body.includes('checking your browser')
                            || body.includes('verify you are human')
                            || body.includes('attention required')
                            || body.includes('cf-chl-')
                            || plain.includes('verifiez que vous etes humain')
                            || plain.includes('verification de securite en cours');
                        // Which structural selector matched, if any: the trace has to tell a real
                        // interstitial from a page still carrying a leftover, hidden container.
                        const selectorHit = '${ChallengePageSelectors}'.split(',').map(part => part.trim()).find(part => {
                            try {
                                return !!document.querySelector(part);
                            } catch (error) {
                                return false;
                            }
                        }) || '';
                        const isChallenge = titleHit || bodyHit || !!selectorHit;
                        const why = [ titleHit && 'title', bodyHit && 'body', selectorHit && 'sel:' + selectorHit ].filter(Boolean).join('+');
                        // Same probe as the stalled-reload check: wherever the page renders the
                        // clickable control (nested frame, shadow root, plain checkbox), a visible
                        // one means the user can solve it — never reload it, and keep the window
                        // interactive instead of treating it as an auto-resolving challenge.
                        const probe = isChallenge ? ${CHALLENGE_WIDGET_PROBE} : { widget: false, frames: '', dom: '', age: 0, announce: '' };
                        const hasRealWidget = probe.widget || !!document.querySelector('${ChallengeWidgetSelectors}');
                        return { isChallenge, hasRealWidget, frames: probe.frames, dom: probe.dom, age: probe.age, announce: probe.announce, why };
                    })()
                `;

                let cloudflare: { isChallenge: boolean; hasRealWidget: boolean; frames?: string; dom?: string; age?: number; announce?: string; why?: string } | undefined;
                // The grace delay above protects Cloudflare's proof phase. Do not keep
                // probing for 20 seconds after it: CrunchyScan needs its visible window
                // before the caller's listing timeout expires. Retry transient navigation
                // races with exponential backoff instead of a fixed delay.
                for (let attempt = 0; attempt < 4 && cloudflare === undefined; attempt++) {
                    try {
                        cloudflare = await win.ExecuteScript<{ isChallenge: boolean; hasRealWidget: boolean; frames?: string; dom?: string; age?: number; announce?: string; why?: string }>(cloudflareDetectionScript);
                    } catch {
                        if (attempt < 3) await Delay(BackoffDelay(attempt, 500, 2_000));
                    }
                }

                // Site-specific anti-scraping detections are authoritative: they know the challenge
                // mechanics of their own site (e.g. CrunchyScan's Turnstile lives in a subframe and
                // never shows a widget in the parent DOM, JapScan's #jc-overlay puzzle, MangaLink's
                // reCAPTCHA form). Run them BEFORE the generic DOM heuristic, otherwise a subframe
                // challenge would be misclassified as Automatic and the interactive window (which is
                // what actually issues the session cookie) would never open.
                try {
                    redirect = await CheckAntiScrapingDetection(win, request.url);
                } catch (error) {
                    // The obfuscated anti-scraping detections can throw on pages whose DOM they do
                    // not expect (e.g. `removeChild` on a node missing after the reader hydrates).
                    // A failing detection must not block scraping: treat it as "no challenge".
                    console.warn('CheckAntiScrapingDetection failed, assuming no challenge:', error);
                    redirect = FetchRedirection.None;
                }

                // No site-specific detection fired: fall back to the generic Cloudflare DOM heuristic
                // so challenges on sites without a custom detection (MangaFire, Comix, …) still
                // auto-resolve in the background without flashing a window.
                if (redirect === FetchRedirection.None && cloudflare?.isChallenge) {
                    redirect = cloudflare.hasRealWidget ? FetchRedirection.Interactive : FetchRedirection.Automatic;
                    invocations.push({ name: 'CloudflareDetected', info: cloudflare.hasRealWidget ? 'Interactive (real widget)' : 'Automatic (managed, wait for auto-resolve)' });
                }

                console.warn("[KUMO] redirect:", FetchRedirection[redirect], "url:", request?.url);
                invocations.push({ name: 'performRedirectionOrFinalize()', info: `Mode: ${FetchRedirection[ redirect ]}` });

                // Start poller only for sites that opted into the stalled-challenge reload
                // (reloading other sites' challenges — e.g. MangaFire's custom WAF — loops forever)
                const stalledReloadEnabled = ShouldReloadStalledChallenge(request.url);
                if (stalledReloadEnabled && reloadBudget.remaining > 0) {
                    stopPollers.push(await this.ReloadStalledCloudFlareChallenge(win, request.url, reloadBudget, invocations, clearanceBaseline));
                }

                const enterInteractive = async () => {
                    // NOTE: Allow the user to solve the captcha within 2.5 minutes before rejecting the request with an error
                    ClearTimeout(cancellation);
                    cancellation = await SetTimeout(() => {
                        if (!settled) {
                            settled = true;
                            void destroy('interactive timeout (150s)');
                            reject(new Exception(R.FetchProvider_FetchWindow_TimeoutError));
                        }
                    }, 150_000);
                    await win.Show();
                    // In-place challenges (e.g. JapScan's `#jc-overlay` puzzle) resolve without
                    // a navigation, so DOMReady never fires again and the extraction script would
                    // never run. Poll until the challenge clears, then run the script on the
                    // now-usable reader page.
                    this.PollForChallengeResolution(win, request.url, cloudflareDetectionScript, runScript, () => settled, stopPollers, invocations, clearanceBaseline);
                };

                const enterAutomatic = () => {
                    // A managed Cloudflare challenge can require a VISIBLE window to issue its
                    // clearance (JapScan: `LESSONS.md` "JapScan et CrunchyScan ont besoin de cette
                    // fenêtre"; CrunchyScan: the cookie is only issued while shown). Fork-handled
                    // sites therefore all show the window before polling — the behaviour restored
                    // by `1bb8d2fc1`, which the `enterAutomatic` refactor of `1dfea5555` had lost
                    // (its comment scoped visibility to the stalled-reload opt-in only, leaving
                    // JapScan backgrounded: the challenge then never resolves → timeout → the
                    // caller retries → new window → visible loop).
                    if (ShouldUseForkChallengeHandling(request.url)) {
                        void win.Show().then(() => this.PollForChallengeResolution(
                            win,
                            request.url,
                            cloudflareDetectionScript,
                            runScript,
                            () => settled,
                            stopPollers,
                            invocations,
                            clearanceBaseline,
                        ));
                    }
                };

                switch (redirect) {
                    case FetchRedirection.Interactive:
                        await enterInteractive();
                        break;
                    case FetchRedirection.Automatic:
                        enterAutomatic();
                        break;
                    default:
                        // Site-specific challenges may be rendered asynchronously, AFTER the
                        // DOMReady that triggered this classification: JapScan's own anti-bot
                        // decides via an AJAX call (a few seconds after the page loaded) whether
                        // its `#jc-overlay` puzzle is required — typically on the SECOND reader
                        // request in a row (e.g. downloading one volume and immediately asking
                        // for the next one). A single detection at DOMReady therefore reports
                        // `None` too early and the extraction starts on a page that is about to
                        // be locked by the puzzle, silently yielding an incomplete page list.
                        // For visible fetches on fork-handled sites (the reader extraction),
                        // show the window and re-run the site detection for a short grace
                        // period; upgrade to the Interactive/Automatic handling as soon as the
                        // puzzle shows up during that window.
                        if (ShouldUseForkChallengeHandling(request.url) && show && !settled) {
                            const grace = 16_000;
                            const step = 2_000;
                            await win.Show();
                            invocations.push({ name: 'AsyncChallengeGrace', info: `Re-polling site detection for ${grace / 1000}s` });
                            let upgraded = FetchRedirection.None;
                            for (let waited = 0; waited < grace && !settled; waited += step) {
                                await Delay(step);
                                if (settled) break;
                                try {
                                    upgraded = await CheckAntiScrapingDetection(win, request.url);
                                } catch {
                                    // Transient navigation race: keep polling
                                    upgraded = FetchRedirection.None;
                                }
                                if (upgraded !== FetchRedirection.None) break;
                            }
                            if (upgraded !== FetchRedirection.None) {
                                console.warn("[KUMO] redirect (grace re-check):", FetchRedirection[upgraded], "url:", request?.url);
                                invocations.push({ name: 'AsyncChallengeDetected', info: `Mode: ${FetchRedirection[ upgraded ]}` });
                            }
                            if (upgraded === FetchRedirection.Interactive) {
                                await enterInteractive();
                                break;
                            }
                            if (upgraded === FetchRedirection.Automatic) {
                                enterAutomatic();
                                break;
                            }
                        }
                        await runScript();
                }
            });

            invocations.push({ name: 'Open', info: `Request URL: ${request.url}` });
            try {
                await win.Open(request, this.featureFlags.VerboseFetchWindow.Value, preload);
            } catch (error) {
                await destroy(`open failed: ${error?.message ?? error}`);
                settled = true;
                ClearTimeout(cancellation);
                reject(error);
            }
        });
    }
}
