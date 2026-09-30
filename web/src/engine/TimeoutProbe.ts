/**
 * Session probe which makes the timeouts of a download observable in the renderer log (F12).
 *
 * Two timeouts used to be invisible: the reader extraction of JapScan swallows every error
 * (`ExtractPagesFromReader` returned `{ links: [] }` without logging) and so does the DRM
 * fallback of `FetchPages` — a chapter could therefore burn its whole 300 s budget and the log
 * stayed silent, leaving only the generic "timed out" card in the UI with nothing to explain why.
 *
 * The probe prints three kinds of line, all filterable on `[probe]`:
 * - `[probe] +M:SS.s step stage=… enter|…|leave …` — breadcrumbs for the stages being entered and
 *   left, so a stage which never reports back is identifiable. A `leave` is only printed when the
 *   stage took at least {@link STEP_MIN_MS}: a fast run is the norm, not a diagnostic.
 * - `[probe] +M:SS.s heartbeat stage=… inner=…` — emitted every {@link HEARTBEAT_MS} while a
 *   stage is pending, so a silent stretch of console can be told apart from a hung stage, and the
 *   `inner=` part names the innermost stage which was running when the tick fired.
 * - `[probe] +M:SS.s timeout|fail stage=…` plus `[probe] +M:SS.s session: …` — a stage which
 *   consumed its budget (or errored early), and the rolling session summary.
 *
 * The `+M:SS.s` stamp is relative to the moment the probe module loaded, which is what lets those
 * lines be placed against the interleaved `[KUMO]`/`[JapScan]` output of the same console.
 */

/** The stages of the chapter pipeline which can burn their whole budget. */
export type ProbeStage = 'chapter-update' | 'page-stall' | 'reader-extract' | 'drm-pages' | 'chapter-list';

export interface ProbeEvent {
    stage: ProbeStage;
    label: string;
    /** Time budget of the stage [ms]. */
    budgetMs: number;
    /** Time the stage actually took before it settled [ms]. */
    elapsedMs: number;
    /** The stage consumed at least half of its budget (or raised a `WithTimeout` error). */
    timedOut: boolean;
    url?: string;
    /** Free context (page index, error message, ...). */
    detail?: string;
}

/** What the caller knows when the stage settles. */
export interface ProbeInput {
    stage: ProbeStage;
    label: string;
    budgetMs: number;
    elapsedMs: number;
    error?: unknown;
    url?: string;
    detail?: string;
}

/** Errors raised by `WithTimeout` — matched by construction, so localization never matters. */
const STALL_MESSAGE = /timed out after \d+ms/;

/** Enough events to see a pattern, few enough to keep the session history cheap. */
export const MAX_PROBE_EVENTS = 50;

/** A `leave` breadcrumb is only printed when the stage lasted at least this long. */
export const STEP_MIN_MS = 10_000;

/** Liveness cadence while a stage is pending. */
export const HEARTBEAT_MS = 30_000;

/** Session origin of the `+M:SS.s` stamp printed on every probe line. */
const ORIGIN = Date.now();

let events: ProbeEvent[] = [];
/** Stages currently running, with their start time (several chapters may run side by side). */
const activeStages = new Map<ProbeStage, number>();
/** Pending heartbeats, keyed by the token returned from {@link StartHeartbeat}. */
const heartbeats = new Map<number, { stage: ProbeStage; since: number; timer?: ReturnType<typeof setTimeout> }>();
let heartbeatUID = 0;

/**
 * Builds the session-relative clock prefix, e.g. `+4:30.2`.
 * @returns The stamp shared by every probe line
 */
function Stamp(): string {
    const elapsed = Math.max(0, Date.now() - ORIGIN);
    const minutes = Math.floor(elapsed / 60_000);
    const seconds = (elapsed % 60_000 / 1000).toFixed(1);
    return `+${minutes}:${seconds.padStart(4, '0')}`;
}

/**
 * Determines whether an error is one of the timeouts raised by `WithTimeout`.
 * @param error - Any rejection reason
 * @returns `true` when the message matches the `<label> timed out after <n>ms` pattern
 */
export function IsBudgetTimeout(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error ?? '');
    return STALL_MESSAGE.test(message);
}

/**
 * Reads the href of an URL which may be unavailable (several containers throw
 * `NotImplementedError` from their `URI` getter instead of returning a value).
 * @param read - Accessor evaluated lazily so a throwing getter cannot break the caller
 * @returns The href, or `undefined` when there is none
 */
export function ProbeHref(read: () => URL | undefined): string | undefined {
    try {
        return read()?.href;
    } catch {
        return undefined;
    }
}

/**
 * Prints a breadcrumb without recording an event.
 * @param stage - The stage the line belongs to
 * @param message - Free text following the `stage=` field
 */
export function RecordStep(stage: ProbeStage, message: string): void {
    console.warn(`[probe] ${Stamp()} step stage=${stage} ${message}`);
}

/**
 * Marks a stage as running and prints its `enter` breadcrumb.
 * @param stage - The stage being entered
 * @param message - Free text, typically the URL about to be fetched
 */
export function EnterStage(stage: ProbeStage, message?: string): void {
    if (!activeStages.has(stage)) {
        activeStages.set(stage, Date.now());
    }
    RecordStep(stage, `enter${message ? ` ${message}` : ''}`);
}

/**
 * Marks a stage as settled and prints its `leave` breadcrumb when it ran long enough.
 * @param stage - The stage being left
 * @param message - Free text, typically the amount of work the stage produced
 * @param force - Print even when the stage was faster than {@link STEP_MIN_MS}
 */
export function LeaveStage(stage: ProbeStage, message?: string, force = false): void {
    const since = activeStages.get(stage);
    activeStages.delete(stage);
    if (since === undefined) {
        return;
    }
    const elapsedMs = Date.now() - since;
    if (!force && elapsedMs < STEP_MIN_MS) {
        return;
    }
    RecordStep(stage, `leave elapsed=${elapsedMs}ms${message ? ` ${message}` : ''}`);
}

/**
 * Describes the stages which are currently running, oldest first — the `inner=` of a heartbeat.
 * @returns e.g. `none` or `reader-extract(+89.5s)`
 */
function DescribeActive(): string {
    if (activeStages.size === 0) {
        return 'none';
    }
    const names: string[] = [];
    let oldest = Date.now();
    for (const [stage, since] of activeStages) {
        names.push(stage);
        if (since < oldest) {
            oldest = since;
        }
    }
    return `${names.join('+')}(+${((Date.now() - oldest) / 1000).toFixed(1)}s)`;
}

/**
 * Starts a heartbeat which logs a liveness line every {@link HEARTBEAT_MS} until it is stopped.
 * @param stage - The stage the caller is waiting for
 * @returns A token to pass to {@link StopHeartbeat}
 */
export function StartHeartbeat(stage: ProbeStage): number {
    const token = ++heartbeatUID;
    const beat: { stage: ProbeStage; since: number; timer?: ReturnType<typeof setTimeout> } = { stage, since: Date.now() };
    heartbeats.set(token, beat);
    const schedule = (): void => {
        beat.timer = setTimeout(() => {
            if (!heartbeats.has(token)) {
                return;
            }
            console.warn(`[probe] ${Stamp()} heartbeat stage=${beat.stage} elapsed=${Date.now() - beat.since}ms inner=${DescribeActive()}`);
            schedule();
        }, HEARTBEAT_MS);
    };
    schedule();
    return token;
}

/**
 * Stops a heartbeat started by {@link StartHeartbeat}. Safe to call for an unknown token.
 * @param token - The token returned when the heartbeat started
 */
export function StopHeartbeat(token: number): void {
    const beat = heartbeats.get(token);
    heartbeats.delete(token);
    if (beat?.timer !== undefined) {
        clearTimeout(beat.timer);
    }
}

/**
 * Records a stage which either consumed its budget or failed, logs it and keeps it for the session.
 * @param input - The stage, its budget, the time it took and its context
 * @returns The recorded event, so callers may inspect `timedOut` when they need to
 */
export function RecordTimeout(input: ProbeInput): ProbeEvent {
    let message = '';
    if (input.error instanceof Error) {
        message = input.error.message;
    } else if (typeof input.error === 'string') {
        message = input.error;
    } else if (input.error !== undefined) {
        message = String(input.error);
    }
    const detail = [input.detail, message].filter(Boolean).join(' | ');
    const event: ProbeEvent = {
        stage: input.stage,
        label: input.label,
        budgetMs: input.budgetMs,
        elapsedMs: input.elapsedMs,
        // Either the timeout was raised by our own `WithTimeout`, or the stage ran at least
        // half of its budget (a localized `FetchProvider_FetchWindow_TimeoutError` has no
        // stable wording to match against).
        timedOut: IsBudgetTimeout(input.error) || input.elapsedMs * 2 >= input.budgetMs,
        url: input.url,
        detail: detail || undefined,
    };
    events.push(event);
    while (events.length > MAX_PROBE_EVENTS) {
        events.shift();
    }
    // The stage settled (badly): it must no longer be reported as running by the heartbeats.
    activeStages.delete(event.stage);
    console.warn(`[probe] ${Stamp()} ${event.timedOut ? 'timeout' : 'fail'} stage=${event.stage} budget=${event.budgetMs} elapsed=${event.elapsedMs}${event.url ? ` url=${event.url}` : ''}${event.detail ? ` ${event.detail}` : ''} label="${event.label}"`);
    console.warn(`[probe] ${Stamp()} session: ${FormatTimeoutSummary()}`);
    return event;
}

/**
 * Summarizes the recorded timeouts of the current session, by stage.
 * @returns A single line, e.g. `2 timeout(s)/3 event(s) -> page-stall×2, reader-extract×1`
 */
export function FormatTimeoutSummary(): string {
    const counts = new Map<ProbeStage, number>();
    let timeouts = 0;
    for (const event of events) {
        if (!event.timedOut) {
            continue;
        }
        timeouts++;
        counts.set(event.stage, (counts.get(event.stage) ?? 0) + 1);
    }
    const parts = [...counts].map(([stage, count]) => `${stage}×${count}`);
    return `${timeouts} timeout(s)/${events.length} event(s)${parts.length > 0 ? ` -> ${parts.join(', ')}` : ''}`;
}

/**
 * Provides a copy of every event recorded in this session (newest last).
 * @returns The session history, capped at {@link MAX_PROBE_EVENTS} entries
 */
export function GetTimeouts(): readonly ProbeEvent[] {
    return [ ...events ];
}

/**
 * Clears the session history, the stage markers and the pending heartbeats (used by the tests).
 */
export function ResetTimeouts(): void {
    for (const token of [ ...heartbeats.keys() ]) {
        StopHeartbeat(token);
    }
    activeStages.clear();
    events = [];
}
