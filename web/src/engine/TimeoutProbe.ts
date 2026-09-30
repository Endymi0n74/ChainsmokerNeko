/**
 * Session probe which makes the timeouts of a download observable in the renderer log (F12).
 *
 * Two timeouts used to be invisible: the reader extraction of JapScan swallows every error
 * (`ExtractPagesFromReader` returned `{ links: [] }` without logging) and so does the DRM
 * fallback of `FetchPages` — a chapter could therefore burn its whole 300 s budget and the log
 * stayed silent, leaving only the generic "timed out" card in the UI with nothing to explain why.
 *
 * Every probe line starts with `[probe] timeout` (budget consumed) or `[probe] fail` (the stage
 * errored before its budget), so the console can be filtered on `[probe]` alone. The bounded
 * session history (`GetTimeouts`) makes a pattern visible at a glance: how often, from which
 * stage, and against which URL.
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

let events: ProbeEvent[] = [];

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
    console.warn(`[probe] ${event.timedOut ? 'timeout' : 'fail'} stage=${event.stage} budget=${event.budgetMs} elapsed=${event.elapsedMs}${event.url ? ` url=${event.url}` : ''}${event.detail ? ` ${event.detail}` : ''} label="${event.label}"`);
    console.warn(`[probe] session: ${FormatTimeoutSummary()}`);
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
 * Clears the session history (used by the tests).
 */
export function ResetTimeouts(): void {
    events = [];
}
