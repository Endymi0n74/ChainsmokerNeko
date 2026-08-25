/**
 * Opt-in per-site for auto-reloading a stalled Cloudflare challenge.
 *
 * Some sites (e.g. crunchyscan.org) are served a "managed" Cloudflare challenge that
 * issues a valid `cf_clearance` cookie but never redirects (the page stays on
 * "Just a moment..." / "Un instant…"). A plain reload then serves the real content.
 *
 * Reloading is DANGEROUS for other challenge types (interactive widgets, or custom
 * WAF pages such as MangaFire's "Security check"): a reload resets the widget and
 * produces an endless reload loop. Sites must therefore opt-in explicitly, so fixing
 * one site can never break another's challenge handling.
 */

const policies: RegExp[] = [];
const forkHandlingPolicies: RegExp[] = [];

/**
 * Register the given hostname pattern as eligible for the stalled-challenge reload.
 */
export function AddStalledChallengeReload(hostname: RegExp): void {
    policies.push(hostname);
    AddForkChallengeHandling(hostname);
}

/**
 * Register a site that needs the fork's challenge handling instead of the upstream flow.
 */
export function AddForkChallengeHandling(hostname: RegExp): void {
    forkHandlingPolicies.push(hostname);
}

/**
 * Check whether the given URL belongs to a site that opted into the reload.
 */
export function ShouldReloadStalledChallenge(url: string): boolean {
    return policies.some(pattern => pattern.test(url));
}

/**
 * Check whether the given URL needs the fork-specific challenge handling.
 */
export function ShouldUseForkChallengeHandling(url: string): boolean {
    return forkHandlingPolicies.some(pattern => pattern.test(url));
}
