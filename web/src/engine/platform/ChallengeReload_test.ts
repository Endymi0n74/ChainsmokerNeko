import { beforeEach, describe, expect, it } from 'vitest';
import {
    CHALLENGE_WINDOW_COOLDOWN, MAX_CHALLENGE_WINDOWS, GetChallengeWindowOrigin,
    PlanChallengeWindow, RecordChallengeWindow, ResetChallengeWindowBudget, ResetChallengeWindowBudgets,
} from './ChallengeReload';

/**
 * The budget which bounds the challenge windows a connector may open successively. The per-window
 * budgets can not do it: the caller answers a challenge it could not validate by opening another
 * window, and each new window starts from a fresh budget.
 */
describe('challenge window budget', () => {

    const JAPSCAN = 'https://www.japscan.lol/manga/demo/12/';
    const OTHER_SITE = 'https://www.crunchyscan.org/series/demo/12/';
    const NOW = 1_000_000;

    beforeEach(() => {
        // The registry is module-wide (that is the point of it), so every test starts from scratch.
        ResetChallengeWindowBudgets();
    });

    it('Should open the window while the origin has not spent its budget', () => {
        expect(PlanChallengeWindow(JAPSCAN, NOW)).toBe('open');
        expect(PlanChallengeWindow(JAPSCAN, NOW)).toBe('open');
    });

    it('Should count the successive windows of an origin and then refuse the next', () => {
        for (let window = 1; window <= MAX_CHALLENGE_WINDOWS; window++) {
            expect(PlanChallengeWindow(JAPSCAN, NOW + window)).toBe('open');
            expect(RecordChallengeWindow(JAPSCAN, NOW + window)).toBe(window);
        }
        // One more challenge window is exactly the loop this budget exists for.
        expect(PlanChallengeWindow(JAPSCAN, NOW + MAX_CHALLENGE_WINDOWS + 1)).toBe('refuse');
    });

    it('Should keep one budget per origin', () => {
        for (let window = 1; window <= MAX_CHALLENGE_WINDOWS; window++) {
            RecordChallengeWindow(JAPSCAN, NOW + window);
        }
        expect(PlanChallengeWindow(JAPSCAN, NOW + 10)).toBe('refuse');
        // Another site is another session, even in the same run.
        expect(PlanChallengeWindow(OTHER_SITE, NOW + 10)).toBe('open');
        expect(RecordChallengeWindow(OTHER_SITE, NOW + 10)).toBe(1);
    });

    it('Should share the budget of one origin across every path it opens', () => {
        // A connector opens one window per chapter: same origin, different paths, one budget.
        RecordChallengeWindow(JAPSCAN, NOW);
        RecordChallengeWindow('https://www.japscan.lol/manga/other/1/', NOW + 1);
        RecordChallengeWindow('https://www.japscan.lol/reader/42/', NOW + 2);
        expect(PlanChallengeWindow('https://www.japscan.lol/manga/third/2/', NOW + 3)).toBe('refuse');
        // The scope is the ORIGIN, so a sibling host keeps its own budget: a site which toggles
        // between `www` and its bare name only ever gets twice the budget, never an unbounded one.
        expect(PlanChallengeWindow('https://japscan.lol/', NOW + 3)).toBe('open');
    });

    it('Should allow the origin again once the cooldown elapsed since the last window', () => {
        for (let window = 1; window <= MAX_CHALLENGE_WINDOWS; window++) {
            RecordChallengeWindow(JAPSCAN, NOW + window);
        }
        expect(PlanChallengeWindow(JAPSCAN, NOW + MAX_CHALLENGE_WINDOWS + CHALLENGE_WINDOW_COOLDOWN - 1)).toBe('refuse');
        // The cooldown runs from the LAST counted window, so a sequence that keeps popping windows
        // can never wait it out.
        const later = NOW + MAX_CHALLENGE_WINDOWS + CHALLENGE_WINDOW_COOLDOWN;
        expect(PlanChallengeWindow(JAPSCAN, later)).toBe('open');
        // … and the succession starts over instead of being resumed where it stopped.
        expect(RecordChallengeWindow(JAPSCAN, later)).toBe(1);
    });

    it('Should clear the succession when a window meets no challenge', () => {
        for (let window = 1; window <= MAX_CHALLENGE_WINDOWS; window++) {
            RecordChallengeWindow(JAPSCAN, NOW + window);
        }
        ResetChallengeWindowBudget(JAPSCAN);
        expect(PlanChallengeWindow(JAPSCAN, NOW + 10)).toBe('open');
        expect(RecordChallengeWindow(JAPSCAN, NOW + 10)).toBe(1);
        // Clearing one origin must not touch another one's succession.
        RecordChallengeWindow(OTHER_SITE, NOW + 10);
        ResetChallengeWindowBudget(JAPSCAN);
        expect(PlanChallengeWindow(OTHER_SITE, NOW + 11)).toBe('open');
        expect(RecordChallengeWindow(OTHER_SITE, NOW + 11)).toBe(2);
    });

    it('Should scope unparsable URLs by their raw value', () => {
        expect(GetChallengeWindowOrigin(JAPSCAN)).toBe('https://www.japscan.lol');
        expect(GetChallengeWindowOrigin('not a url')).toBe('not a url');
        RecordChallengeWindow('not a url', NOW);
        expect(PlanChallengeWindow(JAPSCAN, NOW + 1)).toBe('open');
        expect(RecordChallengeWindow('not a url', NOW + 1)).toBe(2);
    });
});
