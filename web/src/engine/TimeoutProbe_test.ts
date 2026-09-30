import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import {
    RecordTimeout,
    EnterStage,
    LeaveStage,
    StartHeartbeat,
    StopHeartbeat,
    NoteTrail,
    InstallTrail,
    GetTrail,
    GetTimeouts,
    ResetTimeouts,
    FormatTimeoutSummary,
    IsBudgetTimeout,
    ProbeHref,
    MAX_PROBE_EVENTS,
    STEP_MIN_MS,
    HEARTBEAT_MS,
    type ProbeEvent,
} from './TimeoutProbe';

describe('TimeoutProbe', () => {

    let warnSpy: MockInstance<typeof console.warn>;

    beforeEach(() => {
        ResetTimeouts();
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    const lines = (): string[] => warnSpy.mock.calls.map(call => String(call[0]));

    it('Should recognize the timeouts raised by WithTimeout only', () => {
        expect(IsBudgetTimeout(new Error('Page fetch from chapter 12 timed out after 15000ms'))).toBe(true);
        expect(IsBudgetTimeout(new Error('Chapter update for chapter 12 timed out after 300000ms'))).toBe(true);
        // Localized fetch errors carry no stable wording, hence the elapsed-time fallback.
        expect(IsBudgetTimeout(new Error("La requête n'a pas pu être accomplie dans le délai imparti !"))).toBe(false);
        expect(IsBudgetTimeout(new Error('window closed'))).toBe(false);
        expect(IsBudgetTimeout(undefined)).toBe(false);
    });

    it('Should flag an event as a timeout once its budget is consumed', () => {
        const event = RecordTimeout({ stage: 'reader-extract', label: 'ExtractPagesFromReader', budgetMs: 300_000, elapsedMs: 300_012, error: new Error('localized wording'), url: 'https://example.org/manga/chapter-12' });

        expect(event.timedOut).toBe(true);
        expect(GetTimeouts()).toHaveLength(1);
        expect(GetTimeouts()[0].url).toBe('https://example.org/manga/chapter-12');
        expect(GetTimeouts()[0].stage).toBe('reader-extract');
    });

    it('Should flag a fast failure as a failure and not as a timeout', () => {
        const event = RecordTimeout({ stage: 'drm-pages', label: 'DRMProvider.CreateImageLinks', budgetMs: 30_000, elapsedMs: 250, error: new Error('window closed') });

        expect(event.timedOut).toBe(false);
        expect(FormatTimeoutSummary()).toBe('0 timeout(s)/1 event(s)');
    });

    it('Should count the timeouts of the session by stage, ignoring plain failures', () => {
        const stall = { stage: 'page-stall' as const, label: 'Page fetch', budgetMs: 15_000, elapsedMs: 15_010 };
        RecordTimeout({ ...stall, error: new Error('Page fetch from chapter timed out after 15000ms') });
        RecordTimeout({ ...stall, error: new Error('Page fetch from chapter timed out after 15000ms'), detail: 'page 3/42' });
        RecordTimeout({ stage: 'chapter-update', label: 'Chapter update', budgetMs: 300_000, elapsedMs: 300_004, error: new Error('Chapter update timed out after 300000ms') });
        RecordTimeout({ stage: 'drm-pages', label: 'DRM', budgetMs: 30_000, elapsedMs: 120, error: new Error('no payload') });

        expect(FormatTimeoutSummary()).toBe('3 timeout(s)/4 event(s) -> page-stall×2, chapter-update×1');
    });

    it('Should log one line per event with its stage and URL, plus a session line', () => {
        RecordTimeout({ stage: 'page-stall', label: 'Page fetch from chapter 12', budgetMs: 15_000, elapsedMs: 15_008, error: new Error('timed out after 15000ms'), url: 'https://cdn.example.org/img-01.jpg', detail: 'page 1/20' });

        const output = lines();
        expect(output).toHaveLength(2);
        expect(output[0]).toMatch(/^\[probe\] \+\d+:\d{2}\.\d timeout stage=page-stall budget=15000 elapsed=15008/);
        expect(output[0]).toContain('url=https://cdn.example.org/img-01.jpg');
        expect(output[0]).toContain('page 1/20');
        expect(output[1]).toMatch(/^\[probe\] \+\d+:\d{2}\.\d session: /);
    });

    it('Should announce plain failures with a distinct prefix', () => {
        RecordTimeout({ stage: 'chapter-list', label: 'DRMProvider.CreateChapterList', budgetMs: 30_000, elapsedMs: 90, error: new Error('boom') });

        expect(lines()[0]).toMatch(/^\[probe\] \+\d+:\d{2}\.\d fail stage=chapter-list/);
    });

    it('Should keep the session history bounded', () => {
        for (let index = 0; index < MAX_PROBE_EVENTS + 10; index++) {
            RecordTimeout({ stage: 'page-stall', label: `page ${index}`, budgetMs: 15_000, elapsedMs: 15_000, error: new Error('timed out after 15000ms') });
        }

        const history = GetTimeouts();
        expect(history).toHaveLength(MAX_PROBE_EVENTS);
        // The oldest events are dropped, the newest ones are kept.
        expect(history[history.length - 1].label).toBe(`page ${MAX_PROBE_EVENTS + 9}`);
    });

    it('Should combine the caller context and the error message as detail', () => {
        const event = RecordTimeout({ stage: 'page-stall', label: 'Page fetch', budgetMs: 15_000, elapsedMs: 15_000, error: new Error('boom'), detail: 'page 3/42' });

        expect(event.detail).toBe('page 3/42 | boom');
        expect(RecordTimeout({ stage: 'drm-pages', label: 'DRM', budgetMs: 30_000, elapsedMs: 100, detail: 'no error' }).detail).toBe('no error');
    });

    it('Should expose a copy of the session history which cannot mutate the probe', () => {
        RecordTimeout({ stage: 'page-stall', label: 'Page fetch', budgetMs: 15_000, elapsedMs: 15_000, error: new Error('timed out after 15000ms') });
        const history = GetTimeouts() as ProbeEvent[];
        history.length = 0;

        expect(GetTimeouts()).toHaveLength(1);
        ResetTimeouts();
        expect(GetTimeouts()).toHaveLength(0);
        expect(FormatTimeoutSummary()).toBe('0 timeout(s)/0 event(s)');
    });

    it('Should read an href without letting a throwing getter escape', () => {
        expect(ProbeHref(() => new URL('https://example.org/manga/chapter'))).toBe('https://example.org/manga/chapter');
        expect(ProbeHref(() => undefined)).toBeUndefined();
        expect(ProbeHref(() => { throw new Error('Not implemented'); })).toBeUndefined();
    });

    it('Should print the enter breadcrumb of a stage with its URL', () => {
        EnterStage('reader-extract', 'url=https://www.japscan.lol/manga/demo/12/');

        const output = lines();
        expect(output).toHaveLength(1);
        expect(output[0]).toMatch(/^\[probe\] \+\d+:\d{2}\.\d step stage=reader-extract enter url=https:\/\/www\.japscan\.lol\/manga\/demo\/12\//);
    });

    it('Should leave a fast stage silently and a slow one with its elapsed time', () => {
        const base = Date.now();
        const now = vi.spyOn(Date, 'now');
        now.mockReturnValue(base);
        EnterStage('reader-extract');
        LeaveStage('reader-extract', 'links=12');
        // Under the step threshold: only the enter line was printed.
        expect(lines()).toHaveLength(1);

        now.mockReturnValue(base);
        EnterStage('drm-pages');
        now.mockReturnValue(base + STEP_MIN_MS + 1);
        LeaveStage('drm-pages', 'merged 30 page(s)');
        const output = lines();
        expect(output).toHaveLength(3);
        expect(output[2]).toMatch(/step stage=drm-pages leave elapsed=10001ms merged 30 page\(s\)/);
        now.mockReturnValue(base);
    });

    it('Should not print a leave for a stage which never entered', () => {
        LeaveStage('chapter-list', 'whatever', true);

        expect(lines()).toHaveLength(0);
    });

    it('Should stop reporting a stage as active once its timeout is recorded', () => {
        EnterStage('reader-extract');
        RecordTimeout({ stage: 'reader-extract', label: 'ExtractPagesFromReader', budgetMs: 300_000, elapsedMs: 300_000, error: new Error('boom') });

        // The leave of a stage cleared by RecordTimeout finds nothing to report.
        LeaveStage('reader-extract', undefined, true);
        expect(lines().filter(line => line.includes('leave'))).toHaveLength(0);
    });

    it('Should heartbeat while a stage is pending and stop on demand', () => {
        vi.useFakeTimers();
        const token = StartHeartbeat('chapter-update');

        expect(lines()).toHaveLength(0);
        vi.advanceTimersByTime(HEARTBEAT_MS);
        let output = lines();
        expect(output).toHaveLength(1);
        expect(output[0]).toMatch(/^\[probe\] \+\d+:\d{2}\.\d heartbeat stage=chapter-update .*inner=none/);

        // The inner stage of the running heartbeat is part of the line.
        EnterStage('reader-extract');
        warnSpy.mockClear();
        vi.advanceTimersByTime(HEARTBEAT_MS);
        expect(lines()[0]).toContain('inner=reader-extract');
        LeaveStage('reader-extract');

        // Stopped heartbeats stay silent, even once their delay elapses.
        StopHeartbeat(token);
        warnSpy.mockClear();
        vi.advanceTimersByTime(HEARTBEAT_MS * 3);
        expect(lines()).toHaveLength(0);
    });

    it('Should capture only the diagnostic prefixes into the trail', () => {
        const at = Date.now();
        NoteTrail('[KUMO] redirect: Interactive url: https://www.japscan.lol/x', at);
        NoteTrail('FetchWindow()::invocations []', at);
        NoteTrail('[probe] +1:00.0 heartbeat stage=chapter-update elapsed=30000ms inner=none', at);
        NoteTrail('[probe]   +1:00.0 | [KUMO] recap echo', at);
        NoteTrail('[probe] +1:00.0 session: 1 timeout(s)/1 event(s)', at);
        NoteTrail('[ReaderWindow:4] [info] [JapScan] budget: phase=wait', at);
        NoteTrail('[DownloadTask] Chapitre 94: 1 error(s) -> boom', at);

        const texts = GetTrail().map(entry => entry.text);
        expect(texts).toHaveLength(3);
        expect(texts[0]).toContain('[KUMO] redirect');
        expect(texts[1]).toContain('[ReaderWindow:4]');
        expect(texts[2]).toContain('[DownloadTask]');
    });

    it('Should recap the trail since the start of the stage which timed out', () => {
        const base = Date.now();
        NoteTrail('[KUMO] stale entry from an earlier stage', base - 10_000);
        NoteTrail('[probe] step stage=chapter-update begin url=? label="Chapter update for Chapitre 94"', base - 1_000);
        NoteTrail('[probe] step stage=reader-extract enter url=https://www.japscan.lol/manga/demo/94/', base + 100);
        NoteTrail('[KUMO] runScript: executing for https://www.japscan.lol/manga/demo/94/', base + 150);
        NoteTrail('[ReaderWindow:4] [info] [JapScan] budget: phase=wait DEADLINE ok', base + 4_000);
        vi.spyOn(Date, 'now').mockReturnValue(base + 5_000);

        RecordTimeout({ stage: 'chapter-update', label: 'Chapter update for Chapitre 94', budgetMs: 300_000, elapsedMs: 5_000, error: new Error('Chapter update for Chapitre 94 timed out after 300000ms') });

        const output = lines();
        expect(output).toHaveLength(7); // timeout + session + recap header + 4 captured lines
        expect(output[2]).toMatch(/\[probe\] \+\d+:\d{2}\.\d trail since \+\d+:\d{2}\.\d \(4 line\(s\)\):/);
        // The stage's own `begin` sits in the lead-in window just before its timer started.
        expect(output[3]).toContain('step stage=chapter-update begin');
        expect(output[4]).toContain('step stage=reader-extract enter');
        expect(output[5]).toContain('[KUMO] runScript: executing');
        expect(output[6]).toContain('[ReaderWindow:4] [info] [JapScan] budget');
        // Everything printed before the lead-in window stays out of the recap.
        expect(output.join('\n')).not.toContain('stale entry from an earlier stage');
    });

    it('Should recap at most the last lines of a long stage', () => {
        const base = Date.now();
        for (let index = 0; index < 40; index++) {
            NoteTrail(`[KUMO] line ${index}`, base + index);
        }
        vi.spyOn(Date, 'now').mockReturnValue(base + 40);

        RecordTimeout({ stage: 'reader-extract', label: 'ExtractPagesFromReader', budgetMs: 300_000, elapsedMs: 300_000, error: new Error('localized wording') });

        const output = lines();
        const recap = output.filter(line => line.includes('[KUMO] line'));
        expect(recap).toHaveLength(30);
        expect(output[2]).toContain('last 30 of 40 lines');
        expect(recap[0]).toContain('[KUMO] line 10');
        expect(recap[29]).toContain('[KUMO] line 39');
    });

    it('Should not recap a fast failure nor a page stall', () => {
        NoteTrail('[KUMO] redirect: Interactive url: https://www.japscan.lol/x');

        // Failing before its budget: the error line alone is self-explanatory.
        RecordTimeout({ stage: 'chapter-update', label: 'Chapter update', budgetMs: 300_000, elapsedMs: 120, error: new Error('window closed') });
        expect(lines()).toHaveLength(2);

        // A page stall can repeat for every page of a chapter: no recap either.
        RecordTimeout({ stage: 'page-stall', label: 'Page fetch from chapter', budgetMs: 15_000, elapsedMs: 15_010, error: new Error('Page fetch timed out after 15000ms') });
        expect(lines()).toHaveLength(4);
    });

    it('Should route the console through the trail once installed', () => {
        InstallTrail();
        console.warn('[KUMO] poll#1 cf=false widget=false site=Interactive');

        expect(GetTrail().map(entry => entry.text)).toContain('[KUMO] poll#1 cf=false widget=false site=Interactive');
        expect(lines().some(line => line.includes('[KUMO] poll#1'))).toBe(true);
    });
});
