/**
 * Challenge registrations (which sites are handled, and how) and the per-origin window budget.
 *
 * Every per-site decision now comes from ONE table (`ChallengePolicy.ts`): the functions below are
 * the site-facing vocabulary for declaring a policy, and the predicates read it back. A site which
 * declares nothing keeps the upstream behaviour exactly — it is never rerouted and no reload may
 * touch its challenge.
 *
 * The window budget stays here, and deliberately so: it is the only state scoped to the ORIGIN
 * rather than to a window (`ChallengeSession`). The per-window budgets can only bound what happens
 * INSIDE one window, while the caller answers a challenge it could not validate by opening ANOTHER
 * window — each starting from a fresh per-window budget — so nothing within a single window can ever
 * end the sequence the user experiences as a loop.
 */

import { FindChallengePolicy, ResetChallengePolicies, SetChallengePolicy } from './ChallengePolicy';

/**
 * How many challenge windows one origin may open successively before the budget refuses the next.
 */
export const MAX_CHALLENGE_WINDOWS = 3;

/**
 * Sliding window [ms] within which the challenge windows of one origin count as successive: it is
 * refreshed by every counted window, so it also acts as the cooldown imposed once the budget is
 * spent (the next window is only allowed after that much time WITHOUT a challenge window).
 */
export const CHALLENGE_WINDOW_COOLDOWN = 5 * 60_000;

type ChallengeWindowBudget = {
    attempts: number;
    lastAttemptAt: number;
};

/**
 * Origin → challenge windows opened successively, module-wide (shared by every connector call of
 * the session, never by a single window).
 */
const challengeWindowBudgets = new Map<string, ChallengeWindowBudget>();

/**
 * Origin of the given URL, i.e. the scope of the challenge window budget. Unparsable URLs fall
 * back to the string itself, so an exotic request can still not escape its own budget.
 */
export function GetChallengeWindowOrigin(url: string): string {
    try {
        return new URL(url).origin;
    } catch {
        return url;
    }
}

/**
 * Whether the origin of the given {@link url} may still open a challenge window.
 * @param url - The URL whose origin is about to open a window.
 * @param now - The current time [ms], passed in so the decision is pure and testable.
 */
export function PlanChallengeWindow(url: string, now = Date.now()): 'open' | 'refuse' {
    const budget = challengeWindowBudgets.get(GetChallengeWindowOrigin(url));
    const elapsed = budget ? now - budget.lastAttemptAt : Number.POSITIVE_INFINITY;
    return budget && elapsed < CHALLENGE_WINDOW_COOLDOWN && budget.attempts >= MAX_CHALLENGE_WINDOWS
        ? 'refuse'
        : 'open';
}

/**
 * Count one challenge window the origin of the given {@link url} could not get past and return the
 * number of successive ones it has now opened (1 when the previous count had expired).
 *
 * Called when such a window ends, never when it merely met a challenge: counting on the detection
 * would spend the budget of a session whose challenges all resolve.
 * @param url - The URL of the unresolved challenge window.
 * @param now - The current time [ms], passed in so the transition is pure and testable.
 */
export function RecordChallengeWindow(url: string, now = Date.now()): number {
    const origin = GetChallengeWindowOrigin(url);
    const budget = challengeWindowBudgets.get(origin);
    const successive = budget && now - budget.lastAttemptAt < CHALLENGE_WINDOW_COOLDOWN;
    const attempts = successive ? budget.attempts + 1 : 1;
    challengeWindowBudgets.set(origin, { attempts, lastAttemptAt: now });
    return attempts;
}

/**
 * Forget the succession of the origin of the given {@link url}: the window which just ended served a
 * real document, which is the only proof that the origin is serving its content again.
 */
export function ResetChallengeWindowBudget(url: string): void {
    challengeWindowBudgets.delete(GetChallengeWindowOrigin(url));
}

/**
 * Drop every budget and every registration, so a test (or a session the user deliberately restarts)
 * starts from scratch.
 */
export function ResetChallengeWindowBudgets(): void {
    challengeWindowBudgets.clear();
}

/**
 * Register the given hostname pattern as eligible for the stalled-challenge reload.
 *
 * The reload is DANGEROUS for other challenge types (interactive widgets, or custom WAF pages such
 * as MangaFire's "Security check"): a reload resets the widget and produces an endless reload loop.
 * Sites therefore opt in explicitly, so fixing one site can never break another's challenge handling.
 */
export function AddStalledChallengeReload(hostname: RegExp): void {
    SetChallengePolicy(hostname, { stalledReload: true, forkHandling: true });
}

/**
 * Register a site that needs the fork's challenge handling instead of the upstream flow.
 */
export function AddForkChallengeHandling(hostname: RegExp): void {
    SetChallengePolicy(hostname, { forkHandling: true });
}

/**
 * Register a site whose stalled challenge may be restarted by the clearance poller itself.
 *
 * Distinct from {@link AddStalledChallengeReload} on purpose: that reload is driven by the document
 * age and a rendered widget, while this one is triggered by a `cf_clearance` issued while the
 * challenge document stayed current (Cloudflare only honours the cookie on the NEXT request). It
 * navigates the window already open, so only the site actually observed with that exact stall opts
 * in — an unregistered site keeps its current behaviour untouched.
 * @param validationGrace - Minimum time [ms] after the first fresh clearance before the site may
 * restart the document (site-side server-side validation may still be running).
 * @param requireSolveToken - When `true`, a `cf_clearance` change is only trusted as a solve if
 * the challenge document itself carries a completed turnstile response or the origin recorded a
 * resolution recently. Sites whose widget renders in a subframe (its response field is unreadable
 * cross-origin) must stay off this gate. See `ChallengeSession.ReadClearanceRound`.
 */
export function AddClearanceReload(hostname: RegExp, validationGrace?: number, requireSolveToken = false): void {
    SetChallengePolicy(hostname, { clearanceReload: true, validationGrace, requireSolveToken });
}

/**
 * Whether a policy is registered for the given URL at all (any of the flags).
 */
export function HasChallengePolicy(url: string): boolean {
    return FindChallengePolicy(url) !== undefined;
}

/**
 * Check whether the given URL belongs to a site that opted into the reload.
 */
export function ShouldReloadStalledChallenge(url: string): boolean {
    return FindChallengePolicy(url)?.stalledReload === true;
}

/**
 * Whether the time-driven stalled-challenge poller may reload the given URL.
 *
 * A site which requires a completed Turnstile response has a separate clearance-driven recovery
 * path. The age-only stalled poller cannot tell "widget not mounted yet" from "widget probe missed
 * the active control" and would reset the interactive challenge (JapScan's reported reload #1/3).
 * Leave those sites untouched until the token-gated poller sees a genuine solve.
 */
export function ShouldUseStalledChallengeReload(url: string): boolean {
    return ShouldReloadStalledChallenge(url)
        && FindChallengePolicy(url)?.requireSolveToken !== true;
}

/**
 * Check whether the given URL needs the fork-specific challenge handling.
 */
export function ShouldUseForkChallengeHandling(url: string): boolean {
    return FindChallengePolicy(url)?.forkHandling === true;
}

/**
 * Check whether the given URL belongs to a site that opted into the clearance-driven reload.
 */
export function ShouldReloadAfterClearance(url: string): boolean {
    return FindChallengePolicy(url)?.clearanceReload === true;
}

/**
 * Check whether the given URL requires a completed turnstile response (or a recently recorded
 * resolution) before a `cf_clearance` change may arm the clearance-driven reload — see
 * {@link AddClearanceReload}.
 */
export function ShouldRequireSolveToken(url: string): boolean {
    return FindChallengePolicy(url)?.requireSolveToken === true;
}

/**
 * Minimum time [ms] after a fresh clearance before its site may reload the active challenge, or
 * `undefined` when the site declared none (the caller then applies the navigation grace).
 */
export function GetClearanceValidationGrace(url: string): number | undefined {
    return FindChallengePolicy(url)?.validationGrace;
}

/** Reloads the age-driven stalled poller may perform per window on the given site. */
export function GetStalledReloadBudget(url: string): number | undefined {
    return FindChallengePolicy(url)?.stalledReloadBudget;
}

/** Drop every registration. Tests only — see `ResetChallengePolicies`. */
export function ResetChallengeReloads(): void {
    ResetChallengePolicies();
}
