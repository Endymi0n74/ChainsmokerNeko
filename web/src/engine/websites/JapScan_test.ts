import { describe, expect, it } from 'vitest';
import { IsIncompleteReaderResult, IsVolumeChapter, JAPSCAN_CHALLENGE_DETECTION_SCRIPT, MergePageLinks, MIN_READER_PAGES_FOR_COMPLETE_RESULT, ShouldCompleteWithDRM } from './JapScan';

describe('JapScan page fallback helpers', () => {
    it('Should merge DRM pages before reader-only pages', () => {
        expect(MergePageLinks(['page-1', 'page-2'], ['page-2', 'page-3'])).toEqual([
            'page-1',
            'page-2',
            'page-3',
        ]);
    });

    it('Should use a small reader result as a signal for DRM completion', () => {
        expect(MIN_READER_PAGES_FOR_COMPLETE_RESULT).toBe(5);
        expect(ShouldCompleteWithDRM(['page-1', 'page-2', 'page-3'])).toBe(true);
        expect(ShouldCompleteWithDRM(['page-1', 'page-2', 'page-3', 'page-4', 'page-5'])).toBe(false);
    });

    it('Should detect volume chapters by identifier or title', () => {
        expect(IsVolumeChapter({ Identifier: '/manga/dreamland/volume-24/', Title: 'Volume 24' })).toBe(true);
        expect(IsVolumeChapter({ Identifier: '/manga/dreamland/214/', Title: 'Chapitre 214' })).toBe(false);
        expect(IsVolumeChapter({ Identifier: '/manga/dreamland/214/', Title: 'Volume 24' })).toBe(true);
        expect(IsVolumeChapter({ Identifier: '/manga/dreamland/volume-24/', Title: 'Chapitre 214' })).toBe(true);
    });

    it('Should treat a result below the reader total as incomplete', () => {
        expect(IsIncompleteReaderResult(Array.from({ length: 110 }, (_, index) => `page-${index}`), 200)).toBe(true);
        expect(IsIncompleteReaderResult(Array.from({ length: 200 }, (_, index) => `page-${index}`), 200)).toBe(false);
        expect(IsIncompleteReaderResult(Array.from({ length: 210 }, (_, index) => `page-${index}`), 200)).toBe(false);
        expect(IsIncompleteReaderResult(Array.from({ length: 110 }, (_, index) => `page-${index}`), undefined)).toBe(false);
    });
});

interface IOverlayStub {
    style: { display: string; visibility: string; opacity: string };
    offsetHeight: number;
}

/**
 * Runs `JAPSCAN_CHALLENGE_DETECTION_SCRIPT` against a stub DOM, the same way the browser does.
 * Guards the regression where `#jc-overlay` was tested by mere existence, so a hidden (solved)
 * overlay kept reporting "challenge" and every window ended on a timeout.
 */
function RunChallengeDetection(overlay: IOverlayStub | null, captchaNeeded = false): boolean {
    const document = { querySelector: () => overlay };
    const window = {
        getComputedStyle: (node: IOverlayStub) => node.style,
        __captcha: { needed: captchaNeeded },
    };
    const detect = new Function('document', 'window', `return (${JAPSCAN_CHALLENGE_DETECTION_SCRIPT.trim()});`) as
        (scope: typeof document, global: typeof window) => boolean;
    return detect(document, window);
}

function CreateOverlay(overrides: Partial<IOverlayStub> = {}): IOverlayStub {
    return { style: { display: 'block', visibility: 'visible', opacity: '1' }, offsetHeight: 600, ...overrides };
}

describe('JapScan challenge detection', () => {
    it('Should report the puzzle while the overlay is actually visible', () => {
        expect(RunChallengeDetection(CreateOverlay())).toBe(true);
    });

    it('Should stop reporting the challenge once the overlay is hidden by CSS', () => {
        // Regression guard: the node lingers in the DOM after the puzzle was solved.
        // Reporting it as a challenge forever kept `cleared` false, so every window
        // timed out and was re-opened — the visible loop while validating.
        expect(RunChallengeDetection(CreateOverlay({ style: { display: 'none', visibility: 'visible', opacity: '1' } }), true)).toBe(false);
        expect(RunChallengeDetection(CreateOverlay({ style: { display: 'block', visibility: 'hidden', opacity: '1' } }), true)).toBe(false);
        expect(RunChallengeDetection(CreateOverlay({ style: { display: 'block', visibility: 'visible', opacity: '0' } }), true)).toBe(false);
        expect(RunChallengeDetection(CreateOverlay({ offsetHeight: 0 }), true)).toBe(false);
    });

    it('Should detect the puzzle announced before the overlay node is rendered', () => {
        expect(RunChallengeDetection(null, true)).toBe(true);
        expect(RunChallengeDetection(null, false)).toBe(false);
        expect(RunChallengeDetection(null)).toBe(false);
    });

    it('Should not throw on a hostile DOM and report no challenge instead', () => {
        const document = { querySelector: () => { throw new Error('detached'); } };
        const window = { getComputedStyle: () => { throw new Error('detached'); } };
        const detect = new Function('document', 'window', `return (${JAPSCAN_CHALLENGE_DETECTION_SCRIPT.trim()});`) as
            (scope: unknown, global: unknown) => boolean;
        expect(detect(document, window)).toBe(false);
    });
});
