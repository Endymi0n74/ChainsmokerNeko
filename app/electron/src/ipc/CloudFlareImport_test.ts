import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import vm from 'node:vm';
import type { IPC } from './InterProcessCommunication';
import { CloudFlareImport, RenderedPageScript } from './CloudFlareImport';
import { CloudFlareImport as Channels } from '../../../src/ipc/Channels';

const electron = vi.hoisted(() => ({
    cookiesGet: vi.fn(),
    fetch: vi.fn(),
    loadURL: vi.fn(),
    executeJavaScript: vi.fn(),
    destroy: vi.fn(),
    windowConstructor: vi.fn(),
}));

vi.mock('electron', () => ({
    app: {
        getPath: vi.fn(() => '/tmp/hakuneko-userdata'),
    },
    session: {
        defaultSession: {
            cookies: { get: electron.cookiesGet },
            getUserAgent: vi.fn(() => 'TestAgent/1.0'),
            fetch: electron.fetch,
        },
    },
    BrowserWindow: class {
        public readonly webContents = { executeJavaScript: electron.executeJavaScript };
        public readonly loadURL = electron.loadURL;
        public readonly destroy = electron.destroy;
        constructor(options: unknown) {
            electron.windowConstructor(options);
        }
    },
}));

const CleanPage = '<html><head><title>Lecture de Mangas | Japscan</title></head><body>Mangas</body></html>';
const EmbeddedScriptPage = '<html><head><title>Lecture de Mangas | Japscan</title>'
    + '<script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script></head><body>Mangas</body></html>';
const RawPuzzlePage = '<html><head><title>Lecture de Mangas | Japscan</title></head><body><div id="jc-overlay"></div></body></html>';

const VisibleStyle = { display: 'block', visibility: 'visible', opacity: '1' };

/** Runs the rendered-page probe against a fake DOM and returns what the hidden window would read. */
function ProbeRenderedPage(options: { overlay: boolean; style?: Partial<typeof VisibleStyle>; offsetHeight?: number; title?: string }): { overlay: boolean; title: string } {
    const element = options.overlay ? { offsetHeight: options.offsetHeight ?? 120 } : null;
    const document = {
        title: options.title ?? 'Lecture de Mangas | Japscan',
        querySelector: (selector: string) => selector === '#jc-overlay' ? element : null,
    };
    const window = {
        getComputedStyle: () => ({ ...VisibleStyle, ...options.style }),
    };
    return vm.runInNewContext(RenderedPageScript, { document, window }) as { overlay: boolean; title: string };
}

function CreateTestee(): (host: string) => Promise<string> {
    const Listen = vi.fn();
    new CloudFlareImport({ Listen } as unknown as IPC<Channels.Web, Channels.App>);
    const call = Listen.mock.calls.find(([channel]) => channel === Channels.App.TestClearance);
    return call?.[1] as (host: string) => Promise<string>;
}

function MockPage(body: string, status = 200): void {
    electron.fetch.mockResolvedValue(new Response(body, { status, headers: { 'content-type': 'text/html' } }));
}

function MockRenderedDom(page: { overlay: boolean; title?: string }): void {
    electron.executeJavaScript.mockResolvedValue({ overlay: page.overlay, title: page.title ?? 'Lecture de Mangas | Japscan' });
}

/**
 * The hidden window polls the DOM once per second until the budget is spent. The fake clock
 * advances in one-second steps so the poll loop runs to completion without real waiting.
 */
async function RunTest(testee: (host: string) => Promise<string>, host = 'japscan.foo'): Promise<string> {
    const pending = testee(host);
    for (let tick = 0; tick < 15; tick++) {
        await vi.advanceTimersByTimeAsync(1000);
    }
    return pending;
}

beforeEach(() => {
    vi.clearAllMocks();
    electron.cookiesGet.mockResolvedValue([{ name: 'cf_clearance', value: 'token' }]);
});

afterEach(() => {
    vi.useRealTimers();
});

describe('CloudFlareImport rendered-page probe', () => {

    it('Should report the puzzle as visible when the overlay is shown', () => {
        expect(ProbeRenderedPage({ overlay: true })).toEqual({ overlay: true, title: 'Lecture de Mangas | Japscan' });
    });

    it('Should not count the overlay when it has no element', () => {
        expect(ProbeRenderedPage({ overlay: false }).overlay).toBe(false);
    });

    it('Should not count the overlay when CSS hides it with display none', () => {
        expect(ProbeRenderedPage({ overlay: true, style: { display: 'none' } }).overlay).toBe(false);
    });

    it('Should not count the overlay when CSS hides it with visibility hidden', () => {
        expect(ProbeRenderedPage({ overlay: true, style: { visibility: 'hidden' } }).overlay).toBe(false);
    });

    it('Should not count the overlay when its opacity is zero', () => {
        expect(ProbeRenderedPage({ overlay: true, style: { opacity: '0' } }).overlay).toBe(false);
    });

    it('Should not count the overlay when it has no layout height', () => {
        expect(ProbeRenderedPage({ overlay: true, offsetHeight: 0 }).overlay).toBe(false);
    });

});

describe('CloudFlareImport Test now verdict', () => {

    beforeEach(() => {
        vi.useFakeTimers();
    });

    it('Should report still blocked when the rendered JapScan puzzle is visible', async () => {
        MockPage(EmbeddedScriptPage);
        MockRenderedDom({ overlay: true });

        const result = await RunTest(CreateTestee());

        expect(result).toMatch(/^Still blocked — JapScan puzzle \(#jc-overlay\) visible in the rendered page/);
        expect(electron.windowConstructor).toHaveBeenCalledTimes(1);
        expect(electron.destroy).toHaveBeenCalledTimes(1);
    });

    it('Should report still blocked when the raw HTML already contains the puzzle, without rendering', async () => {
        MockPage(RawPuzzlePage);

        const result = await RunTest(CreateTestee());

        expect(result).toMatch(/^Still blocked — JapScan puzzle \(#jc-overlay\) in the page/);
        expect(electron.windowConstructor).not.toHaveBeenCalled();
    });

    it('Should report still blocked when the rendered page shows a Cloudflare challenge title', async () => {
        MockPage(CleanPage);
        MockRenderedDom({ overlay: false, title: 'Un instant…' });

        const result = await RunTest(CreateTestee());

        expect(result).toMatch(/^Still blocked — Cloudflare challenge in the rendered page \(title "Un instant…"\)/);
    });

    it('Should stay inconclusive when embedded scripts are present but no puzzle becomes visible', async () => {
        MockPage(EmbeddedScriptPage);
        MockRenderedDom({ overlay: false });

        const result = await RunTest(CreateTestee());

        expect(result).toMatch(/^Inconclusive — no Cloudflare interstitial, only embedded scripts/);
        expect(result).toContain('no JapScan puzzle visible in the rendered page after 10 s');
        expect(electron.windowConstructor).toHaveBeenCalledTimes(1);
    });

    it('Should report unblocked when the page loads without any puzzle or challenge', async () => {
        MockPage(CleanPage);
        MockRenderedDom({ overlay: false });

        const result = await RunTest(CreateTestee());

        expect(result).toMatch(/^Unblocked — the real page loaded \(HTTP 200/);
    });

});
