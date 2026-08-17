import { describe, it, expect } from 'vitest';
import { ShouldRefreshContentFlags, CheckNewContentTimestampKey } from './HakuNeko';

describe('ShouldRefreshContentFlags', () => {

    const now = 1_000_000_000_000;

    it('Should run when the check never ran before', () => {
        expect(ShouldRefreshContentFlags(0, now, 1440)).toBe(true);
    });

    it('Should not run again within the configured period', () => {
        expect(ShouldRefreshContentFlags(now - 60_000, now, 1440)).toBe(false);
        expect(ShouldRefreshContentFlags(now - 1439 * 60_000, now, 1440)).toBe(false);
    });

    it('Should run again exactly when the period has elapsed', () => {
        expect(ShouldRefreshContentFlags(now - 1440 * 60_000, now, 1440)).toBe(true);
    });

    it('Should run again once the period is exceeded', () => {
        expect(ShouldRefreshContentFlags(now - 1441 * 60_000, now, 1440)).toBe(true);
    });

    it('Should honor a custom short period', () => {
        expect(ShouldRefreshContentFlags(now - 10 * 60_000, now, 5)).toBe(true);
        expect(ShouldRefreshContentFlags(now - 1 * 60_000, now, 5)).toBe(false);
    });

    it('Should expose the timestamp storage key', () => {
        expect(CheckNewContentTimestampKey).toBe('check-new-content-last-run');
    });
});
