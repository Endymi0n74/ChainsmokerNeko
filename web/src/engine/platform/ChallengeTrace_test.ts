import { describe, expect, it, vi, afterEach } from 'vitest';
import { SetChallengeTraceSink, TraceChallenge } from './ChallengeTrace';

/**
 * The trace is the whole point of the diagnosis work: what used to be a DevTools screenshot the user
 * had to copy by hand is now a line per decision, in `diagnostics.log`, which can be grepped. These
 * guards keep it parseable (one line, no empty field) and harmless (a failing sink can never break a
 * challenge resolution).
 */
describe('ChallengeTrace', () => {

    afterEach(() => SetChallengeTraceSink(undefined));

    it('Should emit one greppable line carrying the event and its fields', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const line = TraceChallenge('reload', {
                origin: 'https://japscan.foo', reloads: '1/2', token: true, witness: false, missing: undefined,
            });

            expect(warn).toHaveBeenCalledWith(`[KUMO] trace ${line}`);
            expect(line.startsWith('t=')).toBe(true);
            expect(line).toContain('decision=reload');
            expect(line).toContain('origin=https://japscan.foo');
            expect(line).toContain('reloads=1/2');
            // Flags read like numbers, and a field without a value is dropped instead of left empty.
            expect(line).toContain('token=1');
            expect(line).toContain('witness=0');
            expect(line).not.toContain('missing');
            expect(line).not.toContain('\n');
        } finally {
            warn.mockRestore();
        }
    });

    it('Should collapse a multi-line value so one decision stays one line', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const line = TraceChallenge('wait', { reason: 'first line\n  second line' });

            expect(line).toContain('reason=first line second line');
            expect(line.split('\n')).toHaveLength(1);
        } finally {
            warn.mockRestore();
        }
    });

    it('Should hand the line to the installed sink', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const lines: string[] = [];
        try {
            SetChallengeTraceSink(line => lines.push(line));
            const line = TraceChallenge('extract', { forced: true });

            expect(lines).toEqual([ line ]);
            expect(line).toContain('forced=1');
        } finally {
            warn.mockRestore();
        }
    });

    it('Should survive a failing sink and keep reporting its own failure', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            SetChallengeTraceSink(() => { throw new Error('sink is broken'); });

            expect(() => TraceChallenge('wait', {})).not.toThrow();
            expect(warn.mock.calls.some(call => String(call[0]).includes('sink failed'))).toBe(true);
        } finally {
            warn.mockRestore();
        }
    });

    it('Should keep tracing to the console once the sink is dropped', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            SetChallengeTraceSink(undefined);

            expect(TraceChallenge('fail', { reason: 'budget-spent' })).toContain('decision=fail');
            expect(warn).toHaveBeenCalledTimes(1);
        } finally {
            warn.mockRestore();
        }
    });
});
