import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { IPC, Callback } from './InterProcessCommunication';
import { Diagnostics as Channels } from '../../../src/ipc/Channels';

/** Max size (bytes) before the log file is truncated to its last half. */
const MaxLogSize = 5 * 1024 * 1024;

/**
 * Lets the web app persist diagnostic reports (e.g. the JapScan canvas/pixel extraction
 * state) into `userData/diagnostics.log`, so they can be inspected after a test run.
 * Safe no-op on failure — diagnostics must never break the app.
 */
export default class Diagnostics {

    constructor(private readonly ipc: IPC<Channels.Web, Channels.App>) {
        this.ipc.Listen(Channels.App.WriteLog, this.WriteLog.bind(this) as Callback);
    }

    public async WriteLog(message: string): Promise<void> {
        try {
            const file = path.join(app.getPath('userData'), 'diagnostics.log');
            const line = `[${ new Date().toISOString() }] ${ message }\n`;
            let size = 0;
            try {
                size = fs.statSync(file).size;
            } catch { /* file does not exist yet */ }
            if (size + line.length > MaxLogSize) {
                // Keep the log bounded: drop the first half when it grows too large.
                const content = fs.readFileSync(file, 'utf-8');
                fs.writeFileSync(file, content.slice(Math.floor(content.length / 2)), 'utf-8');
            }
            fs.appendFileSync(file, line, 'utf-8');
        } catch (error) {
            console.warn('Diagnostics: failed to write log:', error);
        }
    }
}
