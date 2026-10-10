import { describe, expect, it } from 'vitest';
// Imported for its registration side effects alone: the assertions below run against the patterns
// the connector really registers, never against a copy which could drift away from them.
import './CrunchyScan';
import { ShouldReloadAfterClearance, ShouldReloadStalledChallenge, ShouldRequireSolveToken, ShouldUseForkChallengeHandling, ShouldUseStalledChallengeReload } from '../platform/ChallengeReload';

describe('CrunchyScan challenge registration', () => {

    it('Should opt into the stalled-challenge reload and keep the fork challenge handling', () => {
        // The managed challenge of this host renders no control in the parent DOM (Turnstile lives
        // in a child frame), so the time-driven reload is what keeps the window from pinning.
        expect(ShouldReloadStalledChallenge('https://www.crunchyscan.org/lecture-en-ligne/demo/')).toBe(true);
        expect(ShouldUseStalledChallengeReload('https://www.crunchyscan.org/lecture-en-ligne/demo/')).toBe(true);
        expect(ShouldUseForkChallengeHandling('https://crunchyscan.org/lecture-en-ligne/demo/')).toBe(true);
        // Both host spellings its connector serves must be covered by the same budget.
        expect(ShouldReloadStalledChallenge('https://crunchyscan.org/')).toBe(true);
        expect(ShouldUseStalledChallengeReload('https://crunchyscan.org/')).toBe(true);
        expect(ShouldReloadStalledChallenge('https://example.com/manga/demo/')).toBe(false);
        expect(ShouldUseStalledChallengeReload('https://example.com/manga/demo/')).toBe(false);
    });

    it('Should restart the stalled challenge window when a clearance is issued for it', () => {
        // The stall documented for this site first (CLOUDFLARE.md §7): Cloudflare issues a fresh
        // `cf_clearance` for the interstitial and never redirects it, so the clearance change is the
        // only resolution signal the poller has. Without this opt-in it waited out the 30 s hold and
        // extracted from the still-current challenge page — an empty result the connector answered
        // with one more window (the reported series of 150 s timeouts).
        expect(ShouldReloadAfterClearance('https://www.crunchyscan.org/lecture-en-ligne/demo/')).toBe(true);
        expect(ShouldReloadAfterClearance('https://crunchyscan.org/')).toBe(true);
        // The sites which never showed that stall keep exactly the challenge handling they had.
        expect(ShouldReloadAfterClearance('https://comix.to/title/demo')).toBe(false);
        expect(ShouldReloadAfterClearance('https://mangafire.to/filter')).toBe(false);
        expect(ShouldReloadAfterClearance('https://www.mangamoins.com/manga/demo')).toBe(false);
        // Its Turnstile renders in a CHILD FRAME: the completed response field is unreadable from
        // the parent document, so this site must keep trusting the bare cf_clearance change — the
        // JapScan-only turnstile gate (ShouldRequireSolveToken) must never leak onto it.
        expect(ShouldRequireSolveToken('https://www.crunchyscan.org/lecture-en-ligne/demo/')).toBe(false);
        expect(ShouldRequireSolveToken('https://crunchyscan.org/')).toBe(false);
    });
});
