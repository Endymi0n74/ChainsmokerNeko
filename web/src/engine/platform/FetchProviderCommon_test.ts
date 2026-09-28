import { describe, expect, it } from 'vitest';
import { MIN_CLEARANCE_LENGTH, NextClearanceState, NormalizeClearance } from './FetchProviderCommon';

/** A realistic Cloudflare clearance (always well above the truncation guard). */
const PERSISTED = `persisted-${'a'.repeat(MIN_CLEARANCE_LENGTH)}`;
const FRESH = `fresh-${'b'.repeat(MIN_CLEARANCE_LENGTH)}`;

describe('NormalizeClearance', () => {
    it('Should keep a full-length clearance as is', () => {
        expect(NormalizeClearance(PERSISTED)).toBe(PERSISTED);
    });

    it('Should reject absent, empty and truncated clearances', () => {
        expect(NormalizeClearance(undefined)).toBe('');
        expect(NormalizeClearance('')).toBe('');
        expect(NormalizeClearance('a'.repeat(MIN_CLEARANCE_LENGTH - 1))).toBe('');
    });
});

describe('NextClearanceState', () => {
    it('Should establish the baseline on the first successful read without reporting a change', () => {
        // Regression guard: with `lastClearance = ''` a persisted cookie looked like a
        // "change" on the very first CDP read, so `runScript()` fired while the user was
        // still solving the challenge and the window was destroyed mid-validation.
        const state = NextClearanceState(undefined, PERSISTED);
        expect(state.baseline).toBe(PERSISTED);
        expect(state.changed).toBe(false);
    });

    it('Should not treat an already-present clearance as proof the challenge was solved', () => {
        const baseline = NextClearanceState(undefined, PERSISTED).baseline;
        const same = NextClearanceState(baseline, PERSISTED);
        expect(same.baseline).toBe(PERSISTED);
        expect(same.changed).toBe(false);
    });

    it('Should report a genuinely new clearance as a resolution', () => {
        const baseline = NextClearanceState(undefined, PERSISTED).baseline;
        const renewed = NextClearanceState(baseline, FRESH);
        expect(renewed.baseline).toBe(FRESH);
        expect(renewed.changed).toBe(true);
    });

    it('Should treat a clearance appearing after a cookie-less baseline as a resolution', () => {
        const baseline = NextClearanceState(undefined, '').baseline;
        expect(baseline).toBe('');
        const issued = NextClearanceState(baseline, FRESH);
        expect(issued.changed).toBe(true);
    });

    it('Should keep the baseline and report no change when the read itself failed', () => {
        const baseline = NextClearanceState(undefined, PERSISTED).baseline;
        const failed = NextClearanceState(baseline, undefined);
        expect(failed.baseline).toBe(PERSISTED);
        expect(failed.changed).toBe(false);
    });

    it('Should ignore a truncated clearance so it can neither clear nor replace the baseline', () => {
        const baseline = NextClearanceState(undefined, PERSISTED).baseline;
        const truncated = NextClearanceState(baseline, 'short');
        expect(truncated.baseline).toBe(PERSISTED);
        expect(truncated.changed).toBe(false);
    });

    it('Should ignore a disappearing clearance instead of reading it as a resolution', () => {
        const baseline = NextClearanceState(undefined, PERSISTED).baseline;
        const removed = NextClearanceState(baseline, '');
        expect(removed.baseline).toBe(PERSISTED);
        expect(removed.changed).toBe(false);
    });
});
