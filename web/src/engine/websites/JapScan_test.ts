import { vi, describe, expect, it, beforeEach, afterEach, type MockInstance } from 'vitest';
import JapScan, { JAPSCAN_CHALLENGE_DETECTION_SCRIPT } from './JapScan';
import { ShouldReloadStalledChallenge, ShouldUseForkChallengeHandling } from '../platform/ChallengeReload';

describe('JapScan connector', () => {

    const connector = new JapScan();

    it('Should expose the main japscan identifier', () => {
        expect(connector.Identifier).toBe('japscan');
    });

    it('Should require a visible browser window for the interactive challenge', () => {
        expect(connector.RequiresVisibleBrowserWindow).toBe(true);
    });

    it('Should accept JapScan manga, manhwa and bd URLs', () => {
        // Same accepted sections as the shipped connector: the catalogue is scraped from
        // `/mangas/` and `/bds/`, and a chapter list only exists under those sections.
        expect(connector.ValidateMangaURL('https://www.japscan.foo/manga/blue-lock/')).toBe(true);
        expect(connector.ValidateMangaURL('https://japscan.to/manhwa/demo/')).toBe(true);
        expect(connector.ValidateMangaURL('https://www.japscan.foo/bd/demo/')).toBe(true);
    });

    it('Should reject sections which carry no chapter list', () => {
        expect(connector.ValidateMangaURL('https://www.japscan.foo/manhua/demo/')).toBe(false);
        expect(connector.ValidateMangaURL('https://www.japscan.foo/comic/demo/')).toBe(false);
    });

    it('Should reject foreign hosts and non-manga paths', () => {
        expect(connector.ValidateMangaURL('https://example.com/manga/blue-lock/')).toBe(false);
        expect(connector.ValidateMangaURL('https://www.japscan.foo/mangas/?p=1')).toBe(false);
        expect(connector.ValidateMangaURL('not a url')).toBe(false);
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

    let warn: MockInstance<typeof console.warn>;

    beforeEach(() => {
        // The script reports the branch which decided the classification through the relayed
        // console line; keep it out of the test output and assert on it instead.
        warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        warn.mockRestore();
    });

    it('Should report the puzzle while the overlay is actually visible', () => {
        expect(RunChallengeDetection(CreateOverlay())).toBe(true);
        expect(warn).toHaveBeenCalledWith('[KUMO] JapScanChallenge overlay:visible -> Interactive');
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

describe('JapScan challenge registration', () => {
    it('Should opt into the stalled-challenge reload and keep the fork challenge handling', () => {
        // Managed Cloudflare challenges on JapScan issue a clearance without redirecting:
        // the bounded reload (which chains the fork handling) is what unpins the window.
        expect(ShouldReloadStalledChallenge('https://www.japscan.foo/manga/blue-lock/')).toBe(true);
        expect(ShouldUseForkChallengeHandling('https://www.japscan.foo/manga/blue-lock/')).toBe(true);
        expect(ShouldReloadStalledChallenge('https://example.com/manga/demo/')).toBe(false);
    });
});
