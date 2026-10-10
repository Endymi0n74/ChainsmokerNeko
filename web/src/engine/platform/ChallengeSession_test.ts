import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { ChallengeSession } from './ChallengeSession';
import { ResetChallengePolicies, SetChallengePolicy } from './ChallengePolicy';
import { CHALLENGE_WIDGET_RENDER_GRACE, COOKIE_CLEARANCE_DOM_GRACE, MAX_CLEARANCE_RELOADS } from './ChallengeDecisions';

const CHALLENGE_URL = 'https://session.example/manga/demo/12/';
/** Long enough to be a real `cf_clearance` (`MIN_CLEARANCE_LENGTH`), never a real cookie value. */
const PERSISTED = 'p'.repeat(300);
const FRESH = 'f'.repeat(300);

/**
 * The session is the answer to the addenda 18→27 family: every one of those bugs was two actors
 * deciding about the same document with their own flags and budgets. These guards pin the two
 * properties that make the class of bug impossible — the session alone owns the state and the
 * budgets, and a round which was overtaken by a navigation may not decide anything at all.
 */
describe('ChallengeSession', () => {

    beforeEach(() => {
        ResetChallengePolicies();
        // The exact policy JapScan declares, plus a stalled budget so one test can exhaust it.
        SetChallengePolicy(/^https:\/\/session\.example/, {
            forkHandling: true, stalledReload: true, clearanceReload: true, validationGrace: 60_000, requireSolveToken: true,
        });
    });

    afterEach(() => ResetChallengePolicies());

    const warned = (): string[] => {
        const warn = vi.mocked(console.warn);
        return warn.mock.calls.map(call => call.map(String).join(' '));
    };

    describe('Failed Cloudflare reload loop (addendum 23: four pollers, one budget, 1.5 s)', () => {

        it('Should refuse every decision of a round whose document was replaced', async () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            try {
                const session = new ChallengeSession(CHALLENGE_URL);
                const overtaken = session.DocumentLoaded(PERSISTED);
                const current = session.DocumentLoaded(PERSISTED);
                expect(current).toBeGreaterThan(overtaken);

                expect(session.DecideStalledReload({ generation: overtaken, isChallenge: true, hasRealWidget: false, age: 20_000 })).toEqual({ kind: 'ignore', freshClearance: false });
                expect(session.DecideClearanceReload({ generation: overtaken, isChallengeDocument: true, markers: '.cf-turnstile', documentAge: 20_000 }).kind).toBe('ignore');
                expect(session.DecideInjection({ generation: overtaken, cleared: true, note: 'changed' })).toEqual({ cleared: false, action: 'wait' });
                expect(await session.ReadClearanceRound({ generation: overtaken, read: async () => FRESH, isChallengeDocument: true, turnstileSolved: false, hasRecentResolution: false })).toEqual({ note: 'ignore', cleared: false });

                // Each refusal names itself: a silent ignore would look exactly like a stuck poller.
                expect(warned().filter(line => line.includes('decision=ignore'))).toHaveLength(4);
                expect(warned().some(line => line.includes('reason=stalled-reload-superseded'))).toBe(true);
            } finally {
                warn.mockRestore();
            }
        });

        it('Should refuse to decide anything once the session is closed', () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            try {
                const session = new ChallengeSession(CHALLENGE_URL);
                const generation = session.DocumentLoaded(PERSISTED);
                session.Settle();

                expect(session.DecideStalledReload({ generation, isChallenge: true, hasRealWidget: false, age: 20_000 }).kind).toBe('ignore');
                expect(session.DecideClearanceReload({ generation, isChallengeDocument: true, markers: '.cf-turnstile', documentAge: 20_000 }).kind).toBe('ignore');
            } finally {
                warn.mockRestore();
            }
        });
    });

    describe('Stalled reload budget', () => {

        it('Should spend the window budget itself and refuse once it is exhausted', () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            try {
                const session = new ChallengeSession(CHALLENGE_URL);
                const generation = session.DocumentLoaded('');
                const observation = { generation, isChallenge: true, hasRealWidget: false, age: CHALLENGE_WIDGET_RENDER_GRACE };

                expect(session.DecideStalledReload(observation).kind).toBe('reload');
                expect(session.DecideStalledReload(observation).kind).toBe('reload');
                expect(session.DecideStalledReload(observation).kind).toBe('reload');
                // The budget is the session's, so a fourth caller cannot reach past it.
                expect(session.stalledReloadsUsed).toBe(3);
                expect(session.StalledReloadBudget).toBe(0);
                expect(session.DecideStalledReload(observation).kind).toBe('wait');
            } finally {
                warn.mockRestore();
            }
        });

        it('Should defer a document younger than the render grace instead of reloading it', () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            try {
                const session = new ChallengeSession(CHALLENGE_URL);
                const generation = session.DocumentLoaded('');

                expect(session.DecideStalledReload({ generation, isChallenge: true, hasRealWidget: false, age: 950 }).kind).toBe('defer');
                expect(session.stalledReloadsUsed).toBe(0);
            } finally {
                warn.mockRestore();
            }
        });

        it('Should close the stalled budget as soon as a clearance was issued', () => {
            // The behaviour the addendum 25 screenshot demanded: right after a solve, the time-driven
            // poller has nothing left to unblock, and its 12 s defer would reset the validated widget.
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            try {
                const session = new ChallengeSession(CHALLENGE_URL);
                const generation = session.DocumentLoaded(PERSISTED);
                session.NoteClearanceIssued(1_000);
                session.DecideClearanceReload({ generation, isChallengeDocument: true, markers: '.cf-turnstile', documentAge: 20_000, now: 1_000 + 120_000 });

                expect(session.StalledReloadBudget).toBe(0);
                expect(session.DecideStalledReload({ generation, isChallenge: true, hasRealWidget: false, age: 20_000 }).kind).toBe('wait');
                expect(session.stalledReloadsUsed).toBe(3);
            } finally {
                warn.mockRestore();
            }
        });
    });

    describe('Clearance gate (addendum 27: a rotation while rendering is not a solve)', () => {

        it('Should read a clearance rotation without a completed token as churn, not as a solve', async () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            try {
                const session = new ChallengeSession(CHALLENGE_URL);
                const generation = session.DocumentLoaded(PERSISTED);
                const round = await session.ReadClearanceRound({
                    generation, read: async () => FRESH, isChallengeDocument: true, turnstileSolved: false, hasRecentResolution: false,
                });

                expect(round).toEqual({ note: 'rotated', cleared: false });
                expect(session.clearanceIssued).toBe(false);
                expect(session.DecideClearanceReload({ generation, isChallengeDocument: true, markers: '.cf-turnstile', documentAge: 20_000 }).kind).toBe('wait');
            } finally {
                warn.mockRestore();
            }
        });

        it('Should trust a clearance whose document carries the completed turnstile response', async () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            try {
                const session = new ChallengeSession(CHALLENGE_URL);
                const generation = session.DocumentLoaded(PERSISTED);
                const round = await session.ReadClearanceRound({
                    generation, read: async () => FRESH, isChallengeDocument: true, turnstileSolved: true, hasRecentResolution: false,
                });

                expect(round).toEqual({ note: 'changed', cleared: true });
            } finally {
                warn.mockRestore();
            }
        });

        it('Should keep a value cycling back to an already-read one as churn', async () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            try {
                const session = new ChallengeSession(CHALLENGE_URL);
                const generation = session.DocumentLoaded(PERSISTED);
                const issued = await session.ReadClearanceRound({ generation, read: async () => FRESH, isChallengeDocument: true, turnstileSolved: true, hasRecentResolution: false });
                const back = await session.ReadClearanceRound({ generation, read: async () => PERSISTED, isChallengeDocument: true, turnstileSolved: true, hasRecentResolution: false });

                expect(issued.cleared).toBe(true);
                expect(back).toEqual({ note: 'reappeared', cleared: false });
            } finally {
                warn.mockRestore();
            }
        });
    });

    describe('Clearance reload (addendum 18/20/23: bounded, paced, and it fails explicitly)', () => {

        const issued = (session: ChallengeSession, generation: number) => {
            session.NoteClearanceIssued(1_000);
            return { generation, isChallengeDocument: true, markers: '.cf-turnstile' };
        };

        it('Should reload once the validation grace elapsed and the document is old enough', () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            try {
                const session = new ChallengeSession(CHALLENGE_URL);
                const generation = session.DocumentLoaded(PERSISTED);
                const round = issued(session, generation);

                const decision = session.DecideClearanceReload({ ...round, documentAge: 20_000, now: 1_000 + 61_000 });
                expect(decision.kind).toBe('reload');
                expect(decision.reloadNumber).toBe(1);
                expect(decision.pending).toBe(false);
            } finally {
                warn.mockRestore();
            }
        });

        it('Should wait out the site validation grace instead of reloading mid-validation', () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            try {
                const session = new ChallengeSession(CHALLENGE_URL);
                const generation = session.DocumentLoaded(PERSISTED);
                const round = issued(session, generation);

                const decision = session.DecideClearanceReload({ ...round, documentAge: 20_000, now: 1_000 + 8_000 });
                expect(decision.kind).toBe('wait');
                expect(decision.reason).toBe('waiting-cloudflare-validation');
                // The round must keep polling: the generic 30 s fallback must not inject meanwhile.
                expect(decision.pending).toBe(true);
            } finally {
                warn.mockRestore();
            }
        });

        it('Should defer BOTH the reload and the failure on a document younger than the render grace', () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            try {
                const session = new ChallengeSession(CHALLENGE_URL);
                const generation = session.DocumentLoaded(PERSISTED);
                const round = issued(session, generation);
                session.clearanceReloads.used = MAX_CLEARANCE_RELOADS;

                const decision = session.DecideClearanceReload({ ...round, documentAge: 950, now: 1_000 + 120_000 });
                expect(decision.kind).toBe('defer');
                expect(decision.pending).toBe(true);
            } finally {
                warn.mockRestore();
            }
        });

        it('Should fail once the budget is spent and the document aged, instead of a silent timeout', () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            try {
                const session = new ChallengeSession(CHALLENGE_URL);
                const generation = session.DocumentLoaded(PERSISTED);
                const round = issued(session, generation);
                session.clearanceReloads.used = MAX_CLEARANCE_RELOADS;

                const decision = session.DecideClearanceReload({ ...round, documentAge: 20_000, now: 1_000 + 120_000 });
                expect(decision.kind).toBe('fail');
                expect(decision.pending).toBe(false);
            } finally {
                warn.mockRestore();
            }
        });
    });

    describe('Injection hold (a clearance is not a usable page)', () => {

        it('Should hold the extraction until the post-solve navigation, then force it after the grace', () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            try {
                const session = new ChallengeSession(CHALLENGE_URL);
                const generation = session.DocumentLoaded(PERSISTED);

                expect(session.DecideInjection({ generation, cleared: true, note: 'changed', now: 1_000 })).toEqual({ cleared: false, action: 'hold' });
                // The deadline is anchored to the first change: a churn of cookies cannot extend it.
                expect(session.DecideInjection({ generation, cleared: true, note: 'changed', now: 1_000 + Math.floor(COOKIE_CLEARANCE_DOM_GRACE / 2) })).toEqual({ cleared: false, action: 'hold' });
                expect(session.DecideInjection({ generation, cleared: true, note: 'changed', now: 1_000 + COOKIE_CLEARANCE_DOM_GRACE })).toEqual({ cleared: true, action: 'force' });
            } finally {
                warn.mockRestore();
            }
        });

        it('Should inject immediately when the document itself cleared the challenge', () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            try {
                const session = new ChallengeSession(CHALLENGE_URL);
                const generation = session.DocumentLoaded(PERSISTED);

                expect(session.DecideInjection({ generation, cleared: true, note: 'skipped' })).toEqual({ cleared: true, action: 'inject' });
            } finally {
                warn.mockRestore();
            }
        });
    });

    describe('Round trace (one greppable line per poll round)', () => {

        it('Should record what a round observed, with the cookie conclusion spelled out', () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            try {
                const session = new ChallengeSession(CHALLENGE_URL);
                const generation = session.DocumentLoaded('');

                session.TraceRound({
                    generation, isChallenge: true, hasRealWidget: false, frames: 'child=0', navigations: 2,
                    age: 6_728, clearanceNote: 'unchanged:0', cleared: false, site: 'Interactive', turnstileSolved: false,
                });

                const line = warned().find(entry => entry.includes('decision=poll'));
                // The whole point of the round line: what the document looked like AND what the cookie
                // check concluded, on one line — the readings that used to be a screenshot of F12.
                expect(line).toContain('origin=https://session.example');
                expect(line).toContain('doc=challenge');
                expect(line).toContain('age=6728ms');
                expect(line).toContain('cf=none');
                expect(line).toContain('widget=0');
                expect(line).toContain('frames=child=0');
                expect(line).toContain('nav=2');
                expect(line).toContain('token=0');
                expect(line).toContain('site=Interactive');
                expect(line).toContain('cleared=0');
            } finally {
                warn.mockRestore();
            }
        });

        it('Should record a round of a superseded document too, unlike a decision', () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            try {
                const session = new ChallengeSession(CHALLENGE_URL);
                const overtaken = session.DocumentLoaded('');
                session.DocumentLoaded('');

                session.TraceRound({ generation: overtaken, isChallenge: false, hasRealWidget: undefined, clearanceNote: 'skipped', cleared: true });

                const line = warned().find(entry => entry.includes('decision=poll'));
                expect(line).toContain('doc=real');
                expect(line).toContain('cf=none');
                expect(line).toContain('cleared=1');
                // An observation is never refused: only the DECISIONS taken from it are.
                expect(line).not.toContain('decision=ignore');
            } finally {
                warn.mockRestore();
            }
        });
    });

    describe('Per-origin window budget', () => {

        it('Should only spend the budget for a window whose last document is still a challenge', () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            try {
                const session = new ChallengeSession(CHALLENGE_URL);
                session.NoteClassification(true);
                expect(session.SpendsWindowBudget).toBe(true);

                // A window which got past its challenge serves the origin's real documents, even when
                // its extraction fails afterwards: it must never count as an unresolved one.
                session.NoteClassification(false);
                expect(session.SpendsWindowBudget).toBe(false);
            } finally {
                warn.mockRestore();
            }
        });

        it('Should record the solve of an in-place resolution exactly once', () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            try {
                const session = new ChallengeSession(CHALLENGE_URL);
                const record = vi.fn();

                // Nothing was observed yet: there is no solve to record.
                session.NoteResolved(record);
                expect(record).not.toHaveBeenCalled();

                session.NoteClassification(true);
                session.NoteResolved(record);
                expect(record).toHaveBeenCalledTimes(1);
                expect(session.SpendsWindowBudget).toBe(false);
            } finally {
                warn.mockRestore();
            }
        });
    });
});
