import fs from 'node:fs';
import path from 'node:path';
import { app, type WebContents } from 'electron';
import type { IPC, Callback } from './InterProcessCommunication';
import { Diagnostics as Channels } from '../../../src/ipc/Channels';

/** Max size (bytes) before the log file is truncated to its last half. */
const MaxLogSize = 5 * 1024 * 1024;

/**
 * Directory the trace is written to: `HAKUNEKO_TRACE_DIR` when set (the replay harness points it at
 * the workspace so a session leaves its trace where it can be read), else the app's own user data.
 */
function GetTraceDirectory(): string {
    return process.env.HAKUNEKO_TRACE_DIR?.trim() || app.getPath('userData');
}

/**
 * Console prefixes worth persisting from the application window.
 *
 * These are the challenge decisions of the engine: `[KUMO]` carries every `poll#N`, reload, refusal
 * and decision trace, `[JapScan]` the reader extraction diag, `[ReaderWindow:` the output of a
 * remote reader window (relayed into the app console by `RemoteBrowserWindow`). Every `error` is
 * kept as well — a Turnstile widget which never mounts is exactly what a page error looks like.
 * The rest of the site console spam is dropped.
 */
const CapturedPrefixes = [ '[KUMO]', '[JapScan]', '[ReaderWindow' ];

/**
 * Console prefixes which already reach the log through their own channel, and must not be mirrored
 * a second time.
 *
 * The challenge trace writes every one of its lines through `Diagnostics.App.WriteLog` (the sink
 * installed by `web/src/engine/platform/ChallengeTrace.ts`) while also printing them to the console
 * for `F12`. Mirroring both would put each decision in the file twice and halve what the 5 MB
 * rotation keeps of a long session. A line relayed from a reader window keeps its `[ReaderWindow:…]`
 * prefix and is therefore still captured here — that window has no sink of its own.
 */
const ChannelWrittenPrefixes = [ '[KUMO] trace ' ];

/**
 * Persists diagnostic reports (the JapScan canvas/pixel extraction state) AND the application
 * window's console into `userData/diagnostics.log`, so a challenge session can be inspected AFTER
 * the fact instead of being copied out of DevTools by hand.
 *
 * Safe no-op on failure — diagnostics must never break the app.
 */
export default class Diagnostics {

    /** Absolute path of the log file this instance writes to. */
    public readonly LogFile: string;

    constructor(private readonly ipc: IPC<Channels.Web, Channels.App>, webContents?: WebContents) {
        this.LogFile = path.join(GetTraceDirectory(), 'diagnostics.log');
        if (process.env.HAKUNEKO_TRACE_DIR?.trim()) {
            try {
                fs.mkdirSync(path.dirname(this.LogFile), { recursive: true });
            } catch { /* another instance may have created it already */ }
        }
        this.ipc.Listen(Channels.App.WriteLog, this.WriteLog.bind(this) as Callback);
        if (webContents) this.Capture(webContents);
    }

    /**
     * Mirror the application window's console into the log file.
     *
     * The challenge path runs in the renderer, so its decisions are only ever visible in `F12` — which
     * is why every diagnosis used to depend on a user screenshot. Mirroring them here gives the same
     * evidence to anything that can read a file (grep, the replay harness, a bug report).
     * @param webContents - The application window whose console to capture.
     */
    public Capture(webContents: WebContents): void {
        webContents.on('console-message', (details) => {
            const level = details.level ?? 'info';
            const message = details.message ?? '';
            if (ChannelWrittenPrefixes.some(prefix => message.startsWith(prefix))) return;
            if (level !== 'error' && !CapturedPrefixes.some(prefix => message.startsWith(prefix))) return;
            void this.WriteLog(`[${level}] ${message}`);
        });
    }

    public async WriteLog(message: string): Promise<void> {
        try {
            const line = `[${ new Date().toISOString() }] ${ message }\n`;
            let size = 0;
            try {
                size = fs.statSync(this.LogFile).size;
            } catch { /* file does not exist yet */ }
            if (size + line.length > MaxLogSize) {
                // Keep the log bounded: drop the first half when it grows too large.
                const content = fs.readFileSync(this.LogFile, 'utf-8');
                fs.writeFileSync(this.LogFile, content.slice(Math.floor(content.length / 2)), 'utf-8');
            }
            fs.appendFileSync(this.LogFile, line, 'utf-8');
        } catch (error) {
            console.warn('Diagnostics: failed to write log:', error);
        }
    }
}
