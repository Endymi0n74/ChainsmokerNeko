import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { app, type WebContents } from 'electron';
import type { IPC } from './InterProcessCommunication';
import { Diagnostics as Channels } from '../../../src/ipc/Channels';
import Diagnostics from './Diagnostics';

vi.mock('electron', () => ({
    app: {
        getPath: vi.fn(() => '/tmp/hakuneko-userdata'),
    },
}));

/** Max size the implementation rotates at (`MaxLogSize`, kept in sync deliberately). */
const MaxLogSize = 5 * 1024 * 1024;

class TestFixture {

    public readonly mockIPC = {
        Listen: vi.fn(),
    } as unknown as IPC<never, never>;

    /** The console listener the implementation registered, so a test can emit console events. */
    private consoleListener: ((details: { level: string; message: string }) => void) | undefined;

    public readonly mockWebContents = {
        on: vi.fn((event: string, listener: (details: { level: string; message: string }) => void) => {
            if (event === 'console-message') this.consoleListener = listener;
            return this.mockWebContents;
        }),
    } as unknown as WebContents;

    private userDataDir: string;

    public constructor() {
        this.userDataDir = app.getPath('userData');
    }

    public CreateTestee(capture = false): Diagnostics {
        return capture ? new Diagnostics(this.mockIPC, this.mockWebContents) : new Diagnostics(this.mockIPC);
    }

    /** Emits one `console-message` event of the application window, as Electron would. */
    public EmitConsole(level: string, message: string): void {
        if (!this.consoleListener) throw new Error('the console was never captured');
        this.consoleListener({ level, message });
    }

    public Read(): string {
        const logFile = path.join(this.userDataDir, 'diagnostics.log');
        return fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf-8') : '';
    }

    public Size(): number {
        const logFile = path.join(this.userDataDir, 'diagnostics.log');
        return fs.existsSync(logFile) ? fs.statSync(logFile).size : 0;
    }
}

let userDataDir: string;
let traceDir: string | undefined;

beforeEach(() => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hakuneko-diagnostics-'));
    vi.mocked(app.getPath).mockReturnValue(userDataDir);
    traceDir = process.env.HAKUNEKO_TRACE_DIR;
    delete process.env.HAKUNEKO_TRACE_DIR;
});

afterEach(() => {
    if (traceDir === undefined) {
        delete process.env.HAKUNEKO_TRACE_DIR;
    } else {
        process.env.HAKUNEKO_TRACE_DIR = traceDir;
    }
    fs.rmSync(userDataDir, { recursive: true, force: true });
});

describe('Diagnostics', () => {

    describe('WriteLog', () => {

        it('Should subscribe to the diagnostics IPC channel', () => {
            const fixture = new TestFixture();
            fixture.CreateTestee();

            expect(fixture.mockIPC.Listen).toHaveBeenCalledTimes(1);
            expect(fixture.mockIPC.Listen).toHaveBeenCalledWith(Channels.App.WriteLog, expect.anything());
        });

        it('Should append one timestamped line per report to the app log', async () => {
            const fixture = new TestFixture();
            const testee = fixture.CreateTestee();

            await testee.WriteLog('[KUMO] trace decision=wait');
            await testee.WriteLog('[KUMO] trace decision=reload');

            const lines = fixture.Read().split('\n').filter(line => line.length > 0);
            expect(lines).toHaveLength(2);
            // A diagnosis needs the order of the decisions, so each line carries its own timestamp.
            expect(lines[0]).toMatch(/^\[\d{4}-\d{2}-\d{2}T[\d:.]+Z\] \[KUMO\] trace decision=wait$/);
            expect(lines[1]).toContain('decision=reload');
        });

        it('Should redirect the log to HAKUNEKO_TRACE_DIR and create that directory', async () => {
            const redirected = path.join(userDataDir, 'nested', 'traces', 'session-1');
            process.env.HAKUNEKO_TRACE_DIR = redirected;
            const fixture = new TestFixture();
            const testee = fixture.CreateTestee();

            await testee.WriteLog('[KUMO] trace decision=fail');

            expect(testee.LogFile).toBe(path.join(redirected, 'diagnostics.log'));
            expect(fs.readFileSync(testee.LogFile, 'utf-8')).toContain('decision=fail');
            // The user data log must stay untouched: the run belongs to the session directory.
            expect(fixture.Read()).toBe('');
        });
    });

    describe('Capture', () => {

        it('Should mirror the challenge decisions and every page error', async () => {
            const fixture = new TestFixture();
            fixture.CreateTestee(true);
            await Promise.resolve();

            fixture.EmitConsole('warning', '[KUMO] redirect: Interactive url: https://www.japscan.foo/manga/-/');
            fixture.EmitConsole('info', '[JapScan] budget: phase=wait');
            fixture.EmitConsole('info', '[ReaderWindow:4] [info] [KUMO] overlay detected');
            fixture.EmitConsole('error', 'Uncaught TypeError: cannot read properties of undefined');
            // The site's own console spam is what made a screenshot unreadable in the first place.
            fixture.EmitConsole('info', 'Uncaught ReferenceError: ga is not defined');
            fixture.EmitConsole('log', 'something else entirely');

            const log = fixture.Read();
            expect(log).toContain('[warning] [KUMO] redirect: Interactive');
            expect(log).toContain('[info] [JapScan] budget');
            expect(log).toContain('[info] [ReaderWindow:4]');
            expect(log).toContain('[error] Uncaught TypeError');
            // A level which is neither an error nor a challenge prefix is dropped, whatever it says.
            expect(log).not.toContain('ga is not defined');
            expect(log).not.toContain('something else entirely');
        });

        it('Should not mirror a line which already reached the log through its own channel', async () => {
            const fixture = new TestFixture();
            const testee = fixture.CreateTestee(true);
            // The challenge trace prints to the console AND writes through `Diagnostics.App.WriteLog`:
            // mirroring the console copy as well would duplicate every decision in the file.
            await testee.WriteLog('[KUMO] trace decision=poll cf=none');
            fixture.EmitConsole('warning', '[KUMO] trace decision=poll cf=none');
            // A relayed reader-window line has no sink of its own and must still be captured.
            fixture.EmitConsole('warning', '[ReaderWindow:3] [warning] [KUMO] trace decision=poll');

            const lines = fixture.Read().split('\n').filter(line => line.length > 0);
            expect(lines).toHaveLength(2);
            expect(lines[0]).toContain('[KUMO] trace decision=poll cf=none');
            expect(lines[1]).toContain('[ReaderWindow:3]');
        });

        it('Should not capture any console when no window is given', () => {
            const fixture = new TestFixture();
            fixture.CreateTestee(false);

            expect(fixture.mockWebContents.on).not.toHaveBeenCalled();
            expect(() => fixture.EmitConsole('error', 'boom')).toThrow('the console was never captured');
        });
    });

    describe('Rotation', () => {

        it('Should keep the log bounded by dropping its first half once it is full', async () => {
            const fixture = new TestFixture();
            const testee = fixture.CreateTestee();
            // Pre-fill past the limit, marking the beginning so the truncation is observable.
            fs.writeFileSync(testee.LogFile, `HEAD${'x'.repeat(MaxLogSize)}`, 'utf-8');
            const full = fixture.Size();

            await testee.WriteLog('[KUMO] trace decision=wait');

            expect(fixture.Size()).toBeLessThan(full);
            const content = fixture.Read();
            expect(content).not.toContain('HEAD');
            expect(content.trimEnd().endsWith('decision=wait')).toBe(true);
        });
    });
});
