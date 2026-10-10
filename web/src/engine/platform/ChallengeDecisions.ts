/**
 * Pure decision pieces of the Cloudflare challenge path: the constants which pace it, the
 * `cf_clearance` bookkeeping, and the three planners which decide what ONE observation may do.
 *
 * Kept apart from the transport (`FetchProviderCommon.ts`) and from the single owner of the state
 * ({@link ChallengeSession}) so each decision can be tested on its own — and so nothing here can
 * reach the network, a window or the console beyond its own trace.
 */

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
 * The `cf=` label of one observed `cf_clearance` read: what a poll round actually concluded about
 * the cookie, in one word, so the trace of a session can be read (and grep'd) without replaying the
 * decisions which produced it.
 *
 * `present` is the case the old trace could not express at all (`unchanged:<length>`): the origin
 * serves a clearance the window did NOT obtain, i.e. the challenge is still in front of the user.
 * @param note - The note a `ReadClearanceRound` returned (`unchanged:<length>`, `baseline:<length>`,
 * `changed`, `rotated`, `reappeared`, `read-failed`, `skipped`).
 */
export function DescribeClearanceNote(note: string): string {
    if (note === 'changed') return 'issued';
    if (note === 'rotated') return 'rotated';
    if (note === 'reappeared') return 'reappeared';
    if (note === 'read-failed') return 'unreadable';
    if (note === 'skipped') return 'none';
    const length = /^(?:unchanged|baseline):(\d+)$/.exec(note)?.[1];
    if (length !== undefined) return Number(length) > 0 ? 'present' : 'none';
    return note;
}

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
 * Never in a position to veto this on its own the document's own widget probe does: a rendered
 * control always wins over the age (see {@link PlanStalledChallengeReload}).
 */
export const CHALLENGE_WIDGET_RENDER_GRACE = 12_000;

/**
 * Wait after a fresh Cloudflare clearance before reloading its still-current interstitial.
 * The user has confirmed that a manual F5 lets JapScan accept the solve; reloading sooner than
 * Cloudflare's post-solve response can commit just resets the active verification and asks for
 * another challenge. The minimum pause leaves the visible challenge window alive while that
 * redirect finishes, and only the clearance-driven recovery path pays it.
 */
export const CLEARANCE_NAVIGATION_GRACE = 30_000;

/**
 * Maximum number of same-window reloads performed because a fresh `cf_clearance` was issued while
 * the document stayed on the Cloudflare challenge. Two, per the user measurement on JapScan: the
 * request which received the clearance still serves the interstitial (Cloudflare only honours the
 * cookie on the NEXT request), the first reload therefore still shows the challenge and the second
 * one serves the reader page. A third navigation only burns the window budget.
 */
export const MAX_CLEARANCE_RELOADS = 2;

/** What {@link PlanScriptInjection} decided about the extraction script of a cleared challenge. */
export type ScriptInjectionAction = 'inject' | 'hold' | 'force' | 'wait';

/**
 * Decides whether the extraction script may run now, be held back, or be forced after the grace.
 *
 * Takes `cleared` (the round resolved the challenge), `clearanceNote` (why the cookie check settled,
 * `'changed'` = a genuine new clearance), `cookieSolvedAt` (when the first cookie change was held
 * back, `undefined` when nothing is pending) and `now`.
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
 * Decides whether the challenge poller must restart the document it is watching.
 *
 * A `cf_clearance` change proves the challenge was solved, but Cloudflare can issue the cookie
 * while the SAME challenge document stays current: the post-solve navigation never commits, so the
 * poller would otherwise wait out its 30 s hold and inject the extraction script ON the challenge
 * page (empty result → the connector opens another window: the reported loop). Restarting the
 * current document is what the user does by hand (F5, sometimes twice): preserve the complete active
 * challenge URL, including ephemeral query tokens such as `__cf_chl_rt_tk`; replacing it with the
 * original request URL restarts a different challenge and can invalidate the solve.
 *
 * `isChallengeDocument` is the Cloudflare-specific marker test (`cfMarkers`), never the generic
 * interstitial heuristic, so an ordinary page which merely carries a leftover container can not be
 * navigated away from.
 * @param options - The poll round's observation, the reloads this window already performed, and the
 * age [ms] of the current challenge document (`undefined` = unknown).
 * @returns `'reload'` (budget left), `'fail'` (the budget is spent and the document is still a
 * challenge: the error must reach the user instead of a silent timeout), `'defer'` while the
 * document is younger than {@link CHALLENGE_WIDGET_RENDER_GRACE} — a document which just loaded
 * has not finished rendering, and judging it races Cloudflare's own post-solve redirect — or
 * `'wait'`.
 */
export function PlanClearanceReload(options: { cleared: boolean; isChallengeDocument: boolean; reloadsUsed: number; age?: number; maxReloads?: number }): 'reload' | 'fail' | 'defer' | 'wait' {
    if (!options.cleared || !options.isChallengeDocument) return 'wait';
    // The reported failure spent BOTH remaining reloads and the error on documents of 950/968 ms,
    // 1.5 s after the clearance arrived: the interstitial which replaced the reloaded one had not
    // even finished rendering. Same render grace as PlanStalledChallengeReload, which likewise
    // treats an unknown age as "too young to judge".
    if (typeof options.age !== 'number' || Number.isNaN(options.age) || options.age < CHALLENGE_WIDGET_RENDER_GRACE) return 'defer';
    return options.reloadsUsed >= (options.maxReloads ?? MAX_CLEARANCE_RELOADS) ? 'fail' : 'reload';
}
