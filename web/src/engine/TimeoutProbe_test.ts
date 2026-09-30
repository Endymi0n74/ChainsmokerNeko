import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    RecordTimeout,
    GetTimeouts,
    ResetTimeouts,
    FormatTimeoutSummary,
    IsBudgetTimeout,
    ProbeHref,
    MAX_PROBE_EVENTS,
    type ProbeEvent,
} from './TimeoutProbe';

describe('TimeoutProbe', () => {

    beforeEach(() => {
        ResetTimeouts();
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

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

        const lines = vi.mocked(console.warn).mock.calls.map(call => String(call[0]));
        expect(lines).toHaveLength(2);
        expect(lines[0]).toContain('[probe] timeout');
        expect(lines[0]).toContain('stage=page-stall');
        expect(lines[0]).toContain('budget=15000');
        expect(lines[0]).toContain('elapsed=15008');
        expect(lines[0]).toContain('url=https://cdn.example.org/img-01.jpg');
        expect(lines[0]).toContain('page 1/20');
        expect(lines[1]).toContain('[probe] session:');
    });

    it('Should announce plain failures with a distinct prefix', () => {
        RecordTimeout({ stage: 'chapter-list', label: 'DRMProvider.CreateChapterList', budgetMs: 30_000, elapsedMs: 90, error: new Error('boom') });

        expect(vi.mocked(console.warn).mock.calls[0][0]).toContain('[probe] fail');
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
});
