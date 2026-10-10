/**
 * Persistent decision trace of the Cloudflare challenge path.
 *
 * Every decision taken about a challenge document is written as ONE greppable line:
 *
 * ```
 * [KUMO] trace t=… origin=japscan.foo gen=2 phase=challenge reloads=1/2 decision=reload reason=clearance-issued-still-challenge doc=challenge age=12221ms clr=changed token=1
 * ```
 *
 * Why this exists: the trace used to live only in the renderer console (`F12`), so every diagnosis
 * depended on the user copying a screenshot by hand, and the 28 addenda in `MEMORY.md` are the price
 * of that loop. The lines keep being printed to the console (the F12 UX is unchanged) AND are handed
 * to a sink, which the Electron platform wires to the `Diagnostics.App.WriteLog` channel → the same
 * `diagnostics.log` the main process already rotates (`userData`, or `HAKUNEKO_TRACE_DIR`).
 *
 * The sink is optional and never awaited: diagnostics must not be able to break the app, and the
 * NodeWebKit build (which has no such channel) simply keeps the console output.
 */

/** Receives one fully formatted trace line (without the `[KUMO] trace ` prefix). */
export type ChallengeTraceSink = (line: string) => void;

let sink: ChallengeTraceSink | undefined;

/**
 * Install (or drop, with `undefined`) the persistent sink of the current platform.
 * @param next - The sink, or `undefined` to keep the console-only behaviour.
 */
export function SetChallengeTraceSink(next: ChallengeTraceSink | undefined): void {
    sink = next;
}

/** Value of one trace field: scalars only, so a line can never grow a nested object dump. */
export type ChallengeTraceValue = string | number | boolean | undefined;

/**
 * Format and emit one decision line.
 *
 * `undefined` fields are dropped (a line never carries an empty `key=`), booleans become `0`/`1` so a
 * number and a flag read the same way, and every value is collapsed onto one line — the trace is
 * meant to be read with `grep`, not parsed.
 * @param event - The decision taken (`wait`, `reload`, `extract`, `fail`, `ignore`, …).
 * @param fields - What the decision was taken from, plus `reason` for the ones which need a why.
 */
export function TraceChallenge(event: string, fields: Record<string, ChallengeTraceValue> = {}): string {
    const parts = [ `t=${new Date().toISOString()}` ];
    for (const [ key, value ] of Object.entries(fields)) {
        if (value === undefined) continue;
        const text = typeof value === 'boolean' ? value ? '1' : '0' : String(value).replace(/\s+/g, ' ').trim();
        parts.push(`${key}=${text}`);
    }
    parts.push(`decision=${event}`);
    const line = parts.join(' ');
    console.warn(`[KUMO] trace ${line}`);
    try {
        sink?.(line);
    } catch (error) {
        // A failing sink must never be the reason a challenge could not be solved.
        console.warn('[KUMO] trace: sink failed:', error);
    }
    return line;
}
