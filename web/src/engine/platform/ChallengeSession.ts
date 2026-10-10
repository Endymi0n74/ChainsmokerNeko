import { type ChallengePolicy, FindChallengePolicy } from './ChallengePolicy';
import {
    CLEARANCE_NAVIGATION_GRACE, DescribeClearanceNote, MAX_CLEARANCE_RELOADS, NormalizeClearance,
    NextClearanceState, PlanClearanceReload, PlanScriptInjection, PlanStalledChallengeReload,
    type ScriptInjectionAction,
} from './ChallengeDecisions';
import { TraceChallenge, type ChallengeTraceValue } from './ChallengeTrace';

/**
 * The challenge state of ONE window, owned by exactly ONE object.
 *
 * This is the structural answer to the failures recorded in `MEMORY.md` addenda 18 → 27: every one
 * of them is two actors deciding about the same document without a shared model — the clearance
 * poller, the age-driven stalled poller, the window relaunch, the HTTP recovery path and the
 * per-site gates each held their own flags, budgets and ideas of what "the current document" was.
 * Traced collisions: a reload fired while the user was validating (`F5` reset the widget), four
 * surviving pollers on one window, the two reloads *and* the failure spent in 1.5 s, and a second
 * poller ignoring the gate that had just refused a rotation.
 *
 * Here, the transport observes and executes; the session decides. It holds the window-scoped state
 * that must survive a navigation (reload budgets, clearance memory, the classification of the
 * current document), the per-document state that must not (the widget sighting, the generation), and
 * it is the ONLY writer of both the console lines and the persistent trace. Two consequences the
 * design buys, both of which were bugs:
 *
 * - **A superseded observer can no longer decide.** A round which was in flight when the document
 *   was replaced carries an old `generation` and gets `ignore` — instead of reloading, failing or
 *   extracting on readings which belong to a document that no longer exists.
 * - **No decision without an owner.** `Stop()`/`Settle()` are checked inside every decision, so the
 *   `stop()` of a poller (which cannot cancel an `ExecuteScript` already in flight) is enough.
 */
export class ChallengeSession {

    /** The URL of the request that opened this window (origin = the budget scope). */
    public readonly url: string;
    /** Declared policy of the site, or `undefined` when it registered none (upstream behaviour). */
    public readonly policy: ChallengePolicy | undefined;

    /** Generation of the CURRENT document: incremented at every `DOMReady`. */
    public generation = 0;
    /** Current phase, for the trace only. */
    public phase: ChallengePhase = 'navigating';

    // Window-scoped state: it must survive the navigations this session performs itself.
    /**
     * Reloads already performed for this window. Deliberately scoped to the window instead of the
     * poller: a reload navigates, its `DOMReady` rebuilds the poller, and a counter living in the
     * poller would be reset by the very reload it just performed (the endless loop).
     */
    public readonly clearanceReloads = { used: 0 };
    /** Reloads left for the age-driven stalled reload of this window. */
    public stalledReloadsUsed = 0;
    /**
     * Set as soon as a round observed a genuine `cf_clearance` change while the challenge document
     * was current, and never reset by the navigation it triggers: the poller the reload rebuilds
     * re-baselines the cookie, so the value which justified the reload then reads as "unchanged" —
     * without this window-scoped memory no round could ever plan the measured "F5 twice" sequence.
     */
    public clearanceIssued = false;
    /** Time [ms] at which the FIRST fresh clearance of this window was issued. */
    public clearanceIssuedAt: number | undefined;

    // Document-scoped state: reset at every `DOMReady`.
    /** `cf_clearance` already present when this document became ready (see `NextClearanceState`). */
    public clearanceBaseline: string | undefined;
    /** Every clearance value this window has read, so a cycling value is churn, not a solve. */
    public readonly seenClearances = new Set<string>();
    /** A control was rendered by an earlier check of the CURRENT document. */
    public widgetEverSeen = false;
    /** Classification of the document the window currently shows (`true` = still a challenge). */
    public challengeCurrent = false;
    /** A challenge was observed at least once in this window (used to record the solve). */
    public challengeObserved = false;

    // Loop-scoped state.
    private stopped = false;
    private settled = false;
    /** Time [ms] at which a `cf_clearance` change was held back on a still-current challenge. */
    private cookieSolvedAt: number | undefined;

    public constructor(url: string, private readonly invocations: { name: string; info: string }[] = []) {
        this.url = url;
        this.policy = FindChallengePolicy(url);
    }

    /** Whether the fork challenge handling owns this site's windows. */
    public get ForkHandled(): boolean {
        return this.policy?.forkHandling === true;
    }

    /** Reloads the age-driven stalled poller may still perform in this window. */
    public get StalledReloadBudget(): number {
        return (this.policy?.stalledReloadBudget ?? 3) - this.stalledReloadsUsed;
    }

    /** Whether a stalled reload is allowed at all for this site (see `ShouldUseStalledChallengeReload`). */
    public get StalledReloadAllowed(): boolean {
        return this.policy?.stalledReload === true && this.policy.requireSolveToken !== true;
    }

    /** Whether the clearance-driven restart is declared for this site. */
    public get ClearanceReloadAllowed(): boolean {
        return this.policy?.clearanceReload === true;
    }

    /** Minimum time [ms] after the first fresh clearance before the clearance reload may fire. */
    public get ValidationGrace(): number {
        return this.policy?.validationGrace ?? CLEARANCE_NAVIGATION_GRACE;
    }

    /** Whether this window is closed to further decisions (the window was destroyed or settled). */
    public get IsClosed(): boolean {
        return this.stopped || this.settled;
    }

    /**
     * A new document became ready: bump the generation, forget everything which described the
     * previous one, and re-baseline its clearance (a clearance the challenged request already
     * carried can never prove it was solved).
     */
    public DocumentLoaded(baseline?: string): number {
        this.generation++;
        this.phase = 'navigating';
        this.widgetEverSeen = false;
        this.clearanceBaseline = typeof baseline === 'string' ? NormalizeClearance(baseline) : undefined;
        if (this.clearanceBaseline) this.seenClearances.add(this.clearanceBaseline);
        return this.generation;
    }

    /**
     * Record the classification of the current document.
     *
     * A document which announced no challenge is the proof that the origin serves real pages again:
     * the succession is over. A document which announced one only MARKS the window as unresolved —
     * the per-origin budget is spent by the caller, and only for a window which still ENDS on that
     * challenge (fork-handled sites open one window per page, which is exactly the traffic that must
     * never be penalised).
     */
    public NoteClassification(isChallenge: boolean): void {
        this.challengeCurrent = isChallenge;
        if (isChallenge) {
            this.challengeObserved = true;
            this.phase = 'challenge';
        } else {
            this.phase = 'extracting';
        }
    }

    /** Mark the window as settled: every later decision is ignored. */
    public Settle(): void {
        this.settled = true;
        this.phase = 'settled';
    }

    /** Close the session (the window is being destroyed): every later decision is ignored. */
    public Stop(): void {
        this.stopped = true;
    }

    /** Mark a failure already reported to the user. */
    public Fail(): void {
        this.settled = true;
        this.phase = 'failed';
    }

    /**
     * The challenge was cleared IN PLACE on the current document (JapScan's own puzzle resolves
     * without a navigation, so no `DOMReady` follows it). The next HTTP request of this origin may
     * then reuse the validation instead of opening another window.
     * @param recordResolve - Called once the solve really was observed in this window.
     */
    public NoteResolved(recordResolve: () => void): void {
        this.challengeCurrent = false;
        if (this.challengeObserved) recordResolve();
    }

    /**
     * Whether a window which ends now must spend one unit of the global per-origin budget: only a
     * window whose LAST document is still a challenge counts (a window which got past its challenge
     * serves the origin's real documents and stays free, even when its extraction fails afterwards).
     */
    public get SpendsWindowBudget(): boolean {
        return this.challengeCurrent;
    }

    private Trace(event: string, fields: Record<string, ChallengeTraceValue> = {}): void {
        TraceChallenge(event, {
            origin: this.Origin,
            gen: this.generation,
            phase: this.phase,
            reloads: `${this.clearanceReloads.used}/${MAX_CLEARANCE_RELOADS}`,
            ...fields,
        });
    }

    private get Origin(): string {
        try {
            return new URL(this.url).origin;
        } catch {
            return this.url;
        }
    }

    /**
     * The one guard every decision goes through: a round which was superseded by a navigation, or
     * which runs after the window settled/was destroyed, may not act — and says so in the trace.
     * @param generation - The document generation the observation belongs to.
     * @returns `true` when the caller must ignore its own observation.
     */
    private IsStale(generation: number, what: string): boolean {
        if (this.IsClosed) {
            this.Trace('ignore', { reason: `${what}-after-close` });
            return true;
        }
        if (generation !== this.generation) {
            this.Trace('ignore', { reason: `${what}-superseded`, seenGen: generation });
            return true;
        }
        return false;
    }

    /**
     * Decide what the age-driven stalled check may do with the document it just observed.
     *
     * Single owner of the budget and of the "a rendered control is never reloaded" rule; the caller
     * only executes the reload it approves.
     * @param observation - The check's readings, the generation they belong to, and the age [ms] of
     * the current document. `clearanceRead` is the value read through CDP when a control was already
     * seen (a fresh clearance is then the second, independent reason to restart the document).
     * @returns `'reload'` (approved, budget consumed), `'defer'` (too young to judge), `'wait'`, or
     * `'ignore'` when the observation belongs to a superseded/closed round.
     */
    public DecideStalledReload(observation: { generation: number; isChallenge: boolean; hasRealWidget: boolean; age: number | undefined; clearanceRead?: string; now?: number }): { kind: 'reload' | 'defer' | 'wait' | 'ignore'; freshClearance: boolean } {
        if (this.IsStale(observation.generation, 'stalled-reload')) return { kind: 'ignore', freshClearance: false };
        this.Trace('watch', {
            doc: observation.isChallenge ? 'challenge' : 'real',
            age: this.FormatAge(observation.age),
            widget: observation.hasRealWidget,
            'reloads-left': this.StalledReloadBudget,
            via: 'stalled',
        });
        let freshClearance = false;
        if (observation.isChallenge && !observation.hasRealWidget && observation.clearanceRead !== undefined) {
            // First successful read establishes the baseline for this document; before that nothing
            // can be "changed" (a clearance already present proves nothing).
            if (this.clearanceBaseline === undefined) {
                this.clearanceBaseline = NormalizeClearance(observation.clearanceRead);
                if (this.clearanceBaseline) this.seenClearances.add(this.clearanceBaseline);
                return { kind: 'wait', freshClearance: false };
            }
            const read = NormalizeClearance(observation.clearanceRead);
            freshClearance = !!read && read !== this.clearanceBaseline && read !== this.lastReloadedClearance;
        }
        const plan = PlanStalledChallengeReload({
            isChallenge: observation.isChallenge,
            hasRealWidget: observation.hasRealWidget,
            widgetEverSeen: this.widgetEverSeen,
            age: observation.age,
            freshClearance,
            remaining: this.StalledReloadBudget,
        });
        if (plan === 'defer') {
            // Too young to judge: said in the trace, and the caller keeps watching.
            this.Trace('defer', { reason: 'widget-may-still-render', age: this.FormatAge(observation.age), via: 'stalled' });
            return { kind: 'defer', freshClearance };
        }
        if (plan === 'reload') {
            this.stalledReloadsUsed++;
            this.lastReloadedClearance = NormalizeClearance(observation.clearanceRead);
            this.Trace('reload', {
                reason: freshClearance ? 'stalled-with-fresh-clearance' : 'stalled-without-control',
                doc: 'challenge', age: this.FormatAge(observation.age), via: 'stalled',
                reloads: `${this.stalledReloadsUsed}/${this.policy?.stalledReloadBudget ?? 3}`,
            });
            return { kind: 'reload', freshClearance };
        }
        return { kind: 'wait', freshClearance };
    }

    /** Clearance value the last approved stalled reload used, so it is not replayed. */
    private lastReloadedClearance = '';

    /**
     * Emit the ONE line a poll round leaves behind.
     *
     * The round is the only gate between "the user solved the challenge" and the extraction script
     * starting, and it used to be silent: a poller which never concluded left `Update()` hanging
     * with nothing but a screenshot to explain why. One line per round — `cf=` says what the cookie
     * check concluded, `doc=`/`age=`/`widget=`/`frames=`/`nav=` what the document looked like —
     * turns a session into a file which can be grepped afterwards.
     *
     * Deliberately NOT gated by {@link IsStale}: unlike a decision, an observation is always worth
     * recording, and a round which was superseded says exactly that right before it is refused.
     * @param round - The round's readings, as the poller took them.
     */
    public TraceRound(round: {
        generation: number;
        isChallenge: boolean;
        hasRealWidget: boolean | undefined;
        frames?: string;
        navigations?: number;
        age?: number;
        clearanceNote: string;
        cleared: boolean;
        site?: string;
        turnstileSolved?: boolean;
    }): void {
        this.Trace('poll', {
            doc: round.isChallenge ? 'challenge' : 'real',
            age: this.FormatAge(round.age),
            cf: DescribeClearanceNote(round.clearanceNote),
            widget: round.hasRealWidget,
            frames: round.frames,
            nav: round.navigations,
            token: round.turnstileSolved,
            site: round.site,
            cleared: round.cleared,
        });
    }

    /**
     * Read and classify the `cf_clearance` cookie of the current document.
     *
     * Owns the whole cookie story — baseline, churn (`reappeared`), the render-time rotation which is
     * NOT a solve (`rotated`), and the genuine change — so no caller can re-implement a part of it.
     * @param round - The generation the read belongs to, how to read the cookie, whether the document
     * is still a Cloudflare challenge, whether its own turnstile response is completed, and whether a
     * resolution was recorded for this origin moments ago (a solve performed in ANOTHER window).
     * @returns The note to trace, and whether a genuine clearance was observed.
     */
    public async ReadClearanceRound(round: {
        generation: number;
        read: () => Promise<string | undefined>;
        isChallengeDocument: boolean;
        turnstileSolved: boolean;
        hasRecentResolution: boolean;
        delay?: (milliseconds: number) => Promise<void>;
        attempts?: number;
    }): Promise<{ note: string; cleared: boolean }> {
        if (this.IsStale(round.generation, 'clearance-read')) return { note: 'ignore', cleared: false };
        const attempts = round.attempts ?? 3;
        const wait = round.delay ?? (async () => void 0);
        // Retry the CDP read with backoff: the debugger is often not ready right after the window
        // opens, and a transient failure must not cost the whole poll cycle.
        // `lastNote` is what the caller traces when no attempt settled the question, so a round whose
        // reads all failed says `read-failed` while one which read an unchanged cookie says
        // `unchanged:N` — the two mean opposite things in the trace.
        let lastNote = 'read-failed';
        for (let attempt = 0; attempt < attempts; attempt++) {
            const current = await round.read();
            if (this.IsStale(round.generation, 'clearance-read')) return { note: 'ignore', cleared: false };
            if (current === undefined) {
                if (attempt < attempts - 1) await wait([ 500, 1000, 2000 ][Math.min(attempt, 2)]);
                continue;
            }
            const firstRead = this.clearanceBaseline === undefined;
            const next = NextClearanceState(this.clearanceBaseline, current, this.seenClearances);
            this.clearanceBaseline = next.baseline;
            if (firstRead) {
                // Whatever was already there proves nothing (see `clearanceBaseline`).
                this.invocations.push({ name: 'CfClearanceBaseline', info: `baseline established (present=${(next.baseline ?? '').length > 0})` });
                return { note: `baseline:${(next.baseline ?? '').length}`, cleared: false };
            }
            if (next.changed) {
                if (next.reappeared) {
                    // Churn, not a solve: the value cycled back to one this window already read.
                    this.Trace('wait', { reason: 'clearance-reappeared', via: 'clearance' });
                    return { note: 'reappeared', cleared: false };
                }
                if (this.policy?.requireSolveToken === true && round.turnstileSolved !== true && !round.hasRecentResolution) {
                    // Cloudflare rotates cf_clearance while it RENDERS the challenge: a change with
                    // no completed widget behind it belongs to nobody's validation. Arming the
                    // bounded reload cycle on it reloads a challenge the user never validated — the
                    // window burned both reloads and died on `survived 2/2 reloads, giving up` while
                    // its interactive budget still had a minute left to click. Only a change backed
                    // by the document's own turnstile response (completed HERE) or by a resolution
                    // recorded for this origin moments ago (a solve in ANOTHER window, whose cookie
                    // landed in this jar) may arm it.
                    this.invocations.push({ name: 'CfClearanceUnconfirmed', info: 'cf_clearance changed without a turnstile response in the document and without a recent resolution: read as challenge-render rotation, not a solve' });
                    this.Trace('wait', { reason: 'clearance-rotated-during-render', clr: 'rotated', token: false, via: 'clearance' });
                    return { note: 'rotated', cleared: false };
                }
                this.invocations.push({ name: 'CfClearanceDetected', info: 'cf_clearance cookie changed via CDP, challenge resolved' });
                this.Trace('wait', { reason: 'clearance-issued', clr: 'changed', token: round.turnstileSolved, via: 'clearance' });
                return { note: 'changed', cleared: true };
            }
            lastNote = `unchanged:${current.length}`;
            if (attempt < attempts - 1) await wait([ 500, 1000, 2000 ][Math.min(attempt, 2)]);
        }
        return { note: lastNote, cleared: false };
    }

    /**
     * Decide what to do now that a clearance was (or was not) observed on a still-current challenge.
     *
     * The single place which answers the user-visible question "do we press F5, give up, or keep
     * waiting for the person in front of the window": a reload requires a credible solve signal, a
     * document old enough to judge, the site's own validation grace, and remaining budget; a
     * rejection names itself in the trace (`defer`, `waiting-validation`, `reload`, `fail`).
     * @param round - Generation, whether the document still carries Cloudflare's challenge markers,
     * its age [ms], and the current time.
     */
    public DecideClearanceReload(round: { generation: number; isChallengeDocument: boolean; markers: string; documentAge: number | undefined; now?: number }): { kind: 'reload' | 'fail' | 'defer' | 'wait' | 'ignore'; reason: string; pending: boolean; age: string; waitMs?: number; reloadNumber?: number } {
        const age = this.FormatAge(round.documentAge);
        if (this.IsStale(round.generation, 'clearance-reload')) return { kind: 'ignore', reason: 'clearance-reload-superseded', pending: false, age };
        if (!this.ClearanceReloadAllowed) return { kind: 'wait', reason: 'site-has-no-clearance-reload', pending: false, age };
        if (this.clearanceIssued) {
            // The clearance solved the challenge: the time-driven stalled reload has nothing left to
            // unblock and its 12 s defer would reset the document the user just validated.
            this.stalledReloadsUsed = this.policy?.stalledReloadBudget ?? 3;
        }
        const plan = PlanClearanceReload({
            cleared: this.clearanceIssued,
            // A marker can linger after the interstitial was solved (e.g. a hidden Turnstile
            // container). Reload only while the current document is still classified as a Cloudflare
            // challenge, not merely because markup remains.
            isChallengeDocument: round.isChallengeDocument && round.markers !== '-' && round.markers !== '',
            reloadsUsed: this.clearanceReloads.used,
            age: round.documentAge,
        });
        if (plan === 'defer') {
            this.Trace('defer', { reason: 'challenge-document-too-young', age, doc: 'challenge', markers: round.markers, via: 'clearance' });
            return { kind: 'defer', reason: 'challenge-document-too-young', pending: this.clearanceIssued, age };
        }
        if (plan === 'wait') return { kind: 'wait', reason: 'nothing-to-reload', pending: false, age };
        const grace = this.ValidationGrace;
        const elapsed = this.clearanceIssuedAt === undefined ? undefined : (round.now ?? Date.now()) - this.clearanceIssuedAt;
        if (elapsed !== undefined && elapsed < grace) {
            // The user has confirmed that a manual F5 unlocks these sites: the reload below IS that
            // F5, so it must happen on the same window, after Cloudflare's own validation had the
            // time to finish — reloading mid-validation only asks for another challenge.
            this.Trace('wait', { reason: 'waiting-cloudflare-validation', remaining: `${grace - elapsed}ms`, doc: 'challenge', age, via: 'clearance' });
            return { kind: 'wait', reason: 'waiting-cloudflare-validation', pending: true, age, waitMs: grace - elapsed };
        }
        if (plan === 'reload') {
            // The budget is the session's STATE, but the increment is performed by the transport's
            // `ReloadChallengeWindow` (its documented contract, asserted by its own test): it counts
            // the reload before navigating, so a navigation which fails still consumes it. The
            // decision therefore reports the number the caller is about to perform.
            this.Trace('reload', { reason: 'clearance-issued-still-challenge', doc: 'challenge', age, markers: round.markers, via: 'clearance' });
            return { kind: 'reload', reason: 'clearance-issued-still-challenge', pending: false, age, reloadNumber: this.clearanceReloads.used + 1 };
        }
        this.Trace('fail', { reason: 'challenge-survived-reloads', doc: 'challenge', age, markers: round.markers, via: 'clearance' });
        return { kind: 'fail', reason: 'challenge-survived-reloads', pending: false, age };
    }

    /**
     * Record the first fresh clearance of this window (the reload's own navigation must not restart
     * the validation grace) and return the timestamp the injection hold starts from.
     */
    public NoteClearanceIssued(now = Date.now()): number {
        this.clearanceIssued = true;
        this.clearanceIssuedAt ??= now;
        this.cookieSolvedAt ??= this.clearanceIssuedAt;
        return this.clearanceIssuedAt;
    }

    /**
     * Decide whether the extraction script may run on the document the window currently shows.
     *
     * A genuine clearance change still has to survive the post-solve navigation: injecting during
     * that window runs the extraction against the challenge DOM and returns an empty result, which
     * the connector answers with yet another window (the reported loop). The hold is bounded, never
     * endless, and its decision is owned here like every other one.
     */
    public DecideInjection(round: { generation: number; cleared: boolean; note: string; now?: number }): { cleared: boolean; action: ScriptInjectionAction } {
        if (this.IsStale(round.generation, 'injection')) return { cleared: false, action: 'wait' };
        const plan = PlanScriptInjection(round.cleared, round.note, this.cookieSolvedAt, round.now ?? Date.now());
        this.cookieSolvedAt = plan.cookieSolvedAt;
        if (plan.action !== 'wait') {
            this.Trace(plan.action === 'hold' ? 'wait' : 'extract', {
                reason: plan.action === 'hold' ? 'awaiting-post-solve-navigation' : plan.action === 'force' ? 'dom-grace-expired' : 'challenge-cleared',
                clr: round.note, forced: plan.action === 'force',
            });
        }
        return { cleared: plan.cleared, action: plan.action };
    }

    /** How long the injection is held back after a clearance change at most. */
    /** The age [ms] a decision is formatted from; `unknown` when the probe could not tell. */
    private FormatAge(age: number | undefined): string {
        return typeof age === 'number' && !Number.isNaN(age) ? `${age}ms` : 'unknown';
    }
}

/** What the session is doing with the document it currently shows. */
export type ChallengePhase = 'navigating' | 'challenge' | 'awaiting-human' | 'awaiting-clearance' | 'extracting' | 'settled' | 'failed';
