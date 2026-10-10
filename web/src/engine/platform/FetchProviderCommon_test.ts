import {
    vi, describe, expect, it, beforeEach, afterEach, type MockInstance
} from 'vitest';
import {
    MIN_CLEARANCE_LENGTH, NextClearanceState, NormalizeClearance, FetchProvider,
    IsCloudFlareChallengeError, IsCloudFlareChallengePage, PlanScriptInjection, COOKIE_CLEARANCE_DOM_GRACE,
    CHALLENGE_WIDGET_PROBE, CHALLENGE_WIDGET_RENDER_GRACE, PlanStalledChallengeReload,
    MAX_CLEARANCE_RELOADS, CLEARANCE_NAVIGATION_GRACE, PlanClearanceReload, ReloadChallengeWindow,
} from './FetchProviderCommon';
import { AddClearanceReload, AddForkChallengeHandling, MAX_CHALLENGE_WINDOWS, ResetChallengeWindowBudgets, ShouldUseForkChallengeHandling, ShouldUseStalledChallengeReload } from './ChallengeReload';
import { Exception } from '../Error';
import { EngineResourceKey as R, LocaleID } from '../../i18n/ILocale';
import { Key } from '../SettingsGlobal';
import type { Choice, ISettings, SettingsManager } from '../SettingsManager';
import type { HakuNeko } from '../HakuNeko';
import type * as AntiScrapingDetectionModule from './AntiScrapingDetection';
import type { FeatureFlags } from '../FeatureFlags';
// Imported for their registration side effects alone, exactly like `JapScan_test.ts` imports its own
// site module: the per-origin challenge window budget only applies to sites which registered the
// fork challenge handling, so guarding "a normal session is never refused" is only meaningful
// against the patterns these sites really register — never against a copy which could drift.
import '../websites/CrunchyScan';
import '../websites/Comix';
import '../websites/MangaFire';
import '../websites/MangaMoins';

// Mocking globals: the localized `Exception.message` resolves through `GetLocale()`.
{
    const mockChoice = { Value: LocaleID.Locale_enUS } as unknown as Choice;
    const mockSettings = { Get: vi.fn(key => key === Key.Language ? mockChoice : undefined) } as unknown as ISettings;
    const mockSettingsManager = { OpenScope: vi.fn(() => mockSettings) } as unknown as SettingsManager;

    globalThis.HakuNeko = Object.assign(globalThis.HakuNeko ?? {}, {
        SettingsManager: mockSettingsManager
    }) as unknown as HakuNeko;
}

/** Receives the window double handed out to the fetch flow by the mocked factory below. */
const harness = vi.hoisted(() => ({ window: undefined as unknown }));

vi.mock('./RemoteBrowserWindow', () => ({
    CreateRemoteBrowserWindow: () => harness.window,
}));

vi.mock('./AntiScrapingDetection', async importOriginal => {
    const original = await importOriginal<typeof AntiScrapingDetectionModule>();
    return {
        ...original,
        // No challenge on the test pages: the flow goes straight to the script dispatch.
        CheckAntiScrapingDetection: async () => original.FetchRedirection.None,
    };
});

/** Marker used to tell the script under test apart from the challenge detection probes. */
const SCRIPT_MARKER = '/*EXTRACT*/';

// The flow under test only enters its fork path (challenge handling + script dispatch) for
// sites which registered that handling. Register the test host the same way `JapScan.ts` does.
AddForkChallengeHandling(/^https:\/\/(?:www\.)?japscan\./);
// Same for the clearance-driven reload: it is opt-in exactly like in `JapScan.ts` — including
// its turnstile gate (third argument): a bare clearance change is Cloudflare's render-time
// rotation and must not arm the reload cycle unless the document carries the response token.
AddClearanceReload(/^https:\/\/(?:www\.)?japscan\./, 60_000, true);

/** A realistic Cloudflare clearance (always well above the truncation guard). */
const PERSISTED = `persisted-${'a'.repeat(MIN_CLEARANCE_LENGTH)}`;
const FRESH = `fresh-${'b'.repeat(MIN_CLEARANCE_LENGTH)}`;

describe('NormalizeClearance', () => {
    it('Should keep a full-length clearance as is', () => {
        expect(NormalizeClearance(PERSISTED)).toBe(PERSISTED);
    });

    it('Should reject absent, empty and truncated clearances', () => {
        expect(NormalizeClearance(undefined)).toBe('');
        expect(NormalizeClearance('')).toBe('');
        expect(NormalizeClearance('a'.repeat(MIN_CLEARANCE_LENGTH - 1))).toBe('');
    });
});

describe('NextClearanceState', () => {
    it('Should establish the baseline on the first successful read without reporting a change', () => {
        // Regression guard: with `lastClearance = ''` a persisted cookie looked like a
        // "change" on the very first CDP read, so `runScript()` fired while the user was
        // still solving the challenge and the window was destroyed mid-validation.
        const state = NextClearanceState(undefined, PERSISTED);
        expect(state.baseline).toBe(PERSISTED);
        expect(state.changed).toBe(false);
    });

    it('Should not treat an already-present clearance as proof the challenge was solved', () => {
        const baseline = NextClearanceState(undefined, PERSISTED).baseline;
        const same = NextClearanceState(baseline, PERSISTED);
        expect(same.baseline).toBe(PERSISTED);
        expect(same.changed).toBe(false);
    });

    it('Should report a genuinely new clearance as a resolution', () => {
        const baseline = NextClearanceState(undefined, PERSISTED).baseline;
        const renewed = NextClearanceState(baseline, FRESH);
        expect(renewed.baseline).toBe(FRESH);
        expect(renewed.changed).toBe(true);
    });

    it('Should treat a clearance appearing after a cookie-less baseline as a resolution', () => {
        const baseline = NextClearanceState(undefined, '').baseline;
        expect(baseline).toBe('');
        const issued = NextClearanceState(baseline, FRESH);
        expect(issued.changed).toBe(true);
    });

    it('Should keep the baseline and report no change when the read itself failed', () => {
        const baseline = NextClearanceState(undefined, PERSISTED).baseline;
        const failed = NextClearanceState(baseline, undefined);
        expect(failed.baseline).toBe(PERSISTED);
        expect(failed.changed).toBe(false);
    });

    it('Should ignore a truncated clearance so it can neither clear nor replace the baseline', () => {
        const baseline = NextClearanceState(undefined, PERSISTED).baseline;
        const truncated = NextClearanceState(baseline, 'short');
        expect(truncated.baseline).toBe(PERSISTED);
        expect(truncated.changed).toBe(false);
    });

    it('Should ignore a disappearing clearance instead of reading it as a resolution', () => {
        const baseline = NextClearanceState(undefined, PERSISTED).baseline;
        const removed = NextClearanceState(baseline, '');
        expect(removed.baseline).toBe(PERSISTED);
        expect(removed.changed).toBe(false);
    });

    it('Should report a clearance cycling back to an already-read value as churn', () => {
        // Two cf_clearance cookies scoped to the same URL alternate between two CDP reads: the
        // value differs from the baseline every time, so without a memory of what was read the
        // poller reported a solve on every round and the hold never reached its deadline.
        const seen = new Set<string>();
        const baseline = NextClearanceState(undefined, PERSISTED, seen).baseline;
        const renewed = NextClearanceState(baseline, FRESH, seen);
        expect(renewed.changed).toBe(true);
        expect(renewed.reappeared).toBe(false);
        const back = NextClearanceState(renewed.baseline, PERSISTED, seen);
        expect(back.changed).toBe(true);
        expect(back.reappeared).toBe(true);
        expect(back.baseline).toBe(PERSISTED);
        // Without the memory the same read stays a plain change: the third argument is opt-in.
        expect(NextClearanceState(baseline, FRESH).reappeared).toBe(false);
    });
});

describe('IsCloudFlareChallengePage', () => {

    it('Should detect the structural markers of a Cloudflare challenge page', () => {
        expect(IsCloudFlareChallengePage('<script src="/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1"></script>')).toBe(true);
        expect(IsCloudFlareChallengePage('<form id="challenge-form" method="POST"></form>')).toBe(true);
        expect(IsCloudFlareChallengePage('<iframe src="https://challenges.cloudflare.com/turnstile/v1/anchor"></iframe>')).toBe(true);
        expect(IsCloudFlareChallengePage('<div id="cf-chl-widget-abc"></div>')).toBe(true);
    });

    it('Should not match ordinary pages that merely use similar words', () => {
        expect(IsCloudFlareChallengePage('<h1>Un instant, le manga arrive</h1><p>Just a moment of reading before the release…</p>')).toBe(false);
        expect(IsCloudFlareChallengePage('<html><body><h1>Regular content</h1></body></html>')).toBe(false);
    });
});

describe('IsCloudFlareChallengeError', () => {

    it('Should accept the exceptions raised for challenge headers and 403 responses', () => {
        expect(IsCloudFlareChallengeError(new Exception(R.FetchProvider_Fetch_CloudFlareChallenge, 'https://www.japscan.lol/'))).toBe(true);
        expect(IsCloudFlareChallengeError(new Exception(R.FetchProvider_Fetch_Forbidden, 'https://www.japscan.lol/'))).toBe(true);
    });

    it('Should reject unrelated errors', () => {
        expect(IsCloudFlareChallengeError(new Exception(R.FetchProvider_Fetch_VercelChallenge, 'https://example.com/'))).toBe(false);
        expect(IsCloudFlareChallengeError(new Error('boom'))).toBe(false);
        expect(IsCloudFlareChallengeError(undefined)).toBe(false);
    });
});

describe('PlanScriptInjection', () => {

    it('Should hold back a cookie change while the challenge document is still current', () => {
        const plan = PlanScriptInjection(true, 'changed', undefined, 1_000);
        expect(plan.action).toBe('hold');
        expect(plan.cleared).toBe(false);
        expect(plan.cookieSolvedAt).toBe(1_000);
    });

    it('Should keep the deadline of the first change while the clearance keeps changing', () => {
        // Cloudflare rotates cf_clearance on every poll round while the challenge page sits
        // (observed on JapScan: two rounds of the same document, 7340 ms and 11915 ms, both
        // reporting a change). Restarting the grace on each of them made the hold endless: the
        // injection never happened and the window ended on its own timeout instead of a result.
        const first = PlanScriptInjection(true, 'changed', undefined, 1_000);
        const churn = PlanScriptInjection(true, 'changed', first.cookieSolvedAt, 1_000 + COOKIE_CLEARANCE_DOM_GRACE - 1);
        expect(churn.action).toBe('hold');
        expect(churn.cleared).toBe(false);
        expect(churn.cookieSolvedAt).toBe(1_000);
    });

    it('Should force the injection when the churn continues past the grace period', () => {
        const plan = PlanScriptInjection(true, 'changed', 1_000, 1_000 + COOKIE_CLEARANCE_DOM_GRACE);
        expect(plan.action).toBe('force');
        expect(plan.cleared).toBe(true);
        expect(plan.cookieSolvedAt).toBeUndefined();
    });

    it('Should inject immediately when the document itself cleared the challenge', () => {
        // The cookie block is skipped on a DOM-cleared round, so the note is "skipped".
        const plan = PlanScriptInjection(true, 'skipped', undefined, 1_000);
        expect(plan.action).toBe('inject');
        expect(plan.cleared).toBe(true);
        expect(plan.cookieSolvedAt).toBeUndefined();
    });

    it('Should keep waiting while the hold is fresh and nothing else cleared the challenge', () => {
        const plan = PlanScriptInjection(false, 'unchanged:40', 1_000, 1_000 + COOKIE_CLEARANCE_DOM_GRACE - 1);
        expect(plan.action).toBe('wait');
        expect(plan.cleared).toBe(false);
        expect(plan.cookieSolvedAt).toBe(1_000);
    });

    it('Should force the injection once the grace period elapsed without a replacement', () => {
        const plan = PlanScriptInjection(false, 'unchanged:40', 1_000, 1_000 + COOKIE_CLEARANCE_DOM_GRACE);
        expect(plan.action).toBe('force');
        expect(plan.cleared).toBe(true);
        expect(plan.cookieSolvedAt).toBeUndefined();
    });

    it('Should not force anything when no cookie change is pending', () => {
        const plan = PlanScriptInjection(false, 'baseline:0', undefined, Number.MAX_SAFE_INTEGER);
        expect(plan.action).toBe('wait');
        expect(plan.cleared).toBe(false);
    });
});

describe('PlanStalledChallengeReload', () => {

    const CHALLENGED = { isChallenge: true, hasRealWidget: false, widgetEverSeen: false, age: CHALLENGE_WIDGET_RENDER_GRACE, freshClearance: false, remaining: 3 };

    it('Should reload a challenge which never rendered a control once the grace elapsed', () => {
        // JapScan: the interstitial keeps its site skeleton, Turnstile never mounts its iframe,
        // and cf_clearance oscillates between two cookie values, so the previous
        // "fresh cf_clearance" gate matched only about half of the checks and the reload never
        // fired (trace `nav=0` on a 19990 ms old challenge document).
        expect(PlanStalledChallengeReload(CHALLENGED)).toBe('reload');
    });

    it('Should defer the reload while the document is younger than the render grace', () => {
        expect(PlanStalledChallengeReload({ ...CHALLENGED, age: CHALLENGE_WIDGET_RENDER_GRACE - 1 })).toBe('defer');
    });

    it('Should defer the reload while the document age is unknown', () => {
        expect(PlanStalledChallengeReload({ ...CHALLENGED, age: undefined })).toBe('defer');
    });

    it('Should wait when a control was rendered without a fresh clearance', () => {
        // A rendered widget means the user may be interacting with it: only the documented
        // "fresh clearance, same document" stall may restart that page.
        expect(PlanStalledChallengeReload({ ...CHALLENGED, widgetEverSeen: true })).toBe('wait');
    });

    it('Should reload on a fresh clearance even after a control was rendered', () => {
        expect(PlanStalledChallengeReload({ ...CHALLENGED, widgetEverSeen: true, freshClearance: true })).toBe('reload');
    });

    it('Should wait once the reload budget is exhausted', () => {
        expect(PlanStalledChallengeReload({ ...CHALLENGED, remaining: 0 })).toBe('wait');
    });

    it('Should wait while the current document is not a challenge', () => {
        expect(PlanStalledChallengeReload({ ...CHALLENGED, isChallenge: false })).toBe('wait');
    });

    it('Should never reload a document that renders a control right now', () => {
        expect(PlanStalledChallengeReload({ ...CHALLENGED, hasRealWidget: true, freshClearance: true })).toBe('wait');
    });
});

describe('PlanClearanceReload', () => {

    const CHALLENGED = { cleared: true, isChallengeDocument: true, reloadsUsed: 0, age: 20_000 };

    /**
     * Drives the poller's loop over successive documents: a reloading document (`true`) restarts
     * the window, `false` means the document was finally replaced by a usable page.
     * @returns The reloads performed and whether the run ended on the error instead of the page.
     */
    const Drive = (documents: boolean[]): { reloads: number[]; failed: boolean } => {
        const reloads: number[] = [];
        for (const stillChallenge of documents) {
            const plan = PlanClearanceReload({ cleared: true, isChallengeDocument: stillChallenge, reloadsUsed: reloads.length, age: 20_000 });
            if (plan === 'reload') {
                reloads.push(reloads.length + 1);
                continue;
            }
            return { reloads, failed: plan === 'fail' };
        }
        return { reloads, failed: false };
    };

    it('Should be bounded at two reloads', () => {
        expect(MAX_CLEARANCE_RELOADS).toBe(2);
    });

    it('Should reload a challenge document which received the clearance, twice at most', () => {
        expect(PlanClearanceReload(CHALLENGED)).toBe('reload');
        expect(PlanClearanceReload({ ...CHALLENGED, reloadsUsed: 1 })).toBe('reload');
    });

    it('Should fail once the two reloads left the document on the challenge', () => {
        expect(PlanClearanceReload({ ...CHALLENGED, reloadsUsed: MAX_CLEARANCE_RELOADS })).toBe('fail');
    });

    it('Should stop reloading as soon as the document was replaced', () => {
        // Measured on JapScan: the first reload still serves the interstitial, the second one
        // serves the reader page. One reload, then a usable document: nothing left to do.
        expect(Drive([ true, false ])).toEqual({ reloads: [ 1 ], failed: false });
    });

    it('Should reload exactly twice before giving up when the document never changes', () => {
        // The user-facing criterion: two reloads, then the error — never a third navigation and
        // never a silent wait for the 150 s window timeout (which the caller answers by opening
        // one more window: the reported loop).
        expect(Drive([ true, true, true, true ])).toEqual({ reloads: [ 1, 2 ], failed: true });
    });

    it('Should leave the document alone unless the clearance was issued', () => {
        // No fresh cf_clearance: the round did not observe a solve, so nothing may be reloaded
        // (a reload would only reset the widget the user is solving).
        expect(PlanClearanceReload({ ...CHALLENGED, cleared: false })).toBe('wait');
        expect(PlanClearanceReload({ ...CHALLENGED, cleared: false, reloadsUsed: MAX_CLEARANCE_RELOADS })).toBe('wait');
    });

    it('Should never touch a document without Cloudflare challenge markup', () => {
        // Only Cloudflare's own markup makes a document eligible: a solved page which merely
        // carries a leftover container must not be navigated away from, even after the budget
        // was spent elsewhere in the same window.
        expect(PlanClearanceReload({ ...CHALLENGED, isChallengeDocument: false })).toBe('wait');
        expect(PlanClearanceReload({ ...CHALLENGED, isChallengeDocument: false, reloadsUsed: MAX_CLEARANCE_RELOADS })).toBe('wait');
    });

    it('Should defer while the current document is younger than the render grace', () => {
        // The reported failure (JapScan, CrunchyScan) spent BOTH remaining reloads and the error
        // on documents of 950/968 ms, 1.5 s after the clearance arrived: the interstitial which
        // replaced the reloaded one had not even finished rendering.
        expect(PlanClearanceReload({ ...CHALLENGED, age: 950 })).toBe('defer');
        expect(PlanClearanceReload({ ...CHALLENGED, age: CHALLENGE_WIDGET_RENDER_GRACE - 1 })).toBe('defer');
        expect(PlanClearanceReload({ ...CHALLENGED, age: CHALLENGE_WIDGET_RENDER_GRACE })).toBe('reload');
    });

    it('Should defer the failure too while the document is too young to judge', () => {
        // A spent budget does not make a 1 s old document judgeable: the navigation the reload
        // just performed must be given the render grace before the error reaches the user.
        expect(PlanClearanceReload({ ...CHALLENGED, reloadsUsed: MAX_CLEARANCE_RELOADS, age: 950 })).toBe('defer');
        expect(PlanClearanceReload({ ...CHALLENGED, reloadsUsed: MAX_CLEARANCE_RELOADS, age: undefined })).toBe('defer');
        expect(PlanClearanceReload({ ...CHALLENGED, reloadsUsed: MAX_CLEARANCE_RELOADS, age: CHALLENGE_WIDGET_RENDER_GRACE })).toBe('fail');
    });
});

describe('ReloadChallengeWindow', () => {

    it('Should preserve Cloudflare’s ephemeral challenge token when reloading the current window', async () => {
        const fake = new FakeWindow();
        const budget = { used: 0 };
        fake.currentURL = new URL('https://www.japscan.foo/manga/-/?__cf_chl_rt_tk=short-lived-token');

        await ReloadChallengeWindow(fake, budget);

        // Equivalent to F5: preserve the current challenge URL, rather than navigating to the
        // connector's original URL and throwing away Cloudflare's one-use token.
        expect(fake.injected).toContain('window.location.reload()');
        expect(fake.navigations).toEqual([ 'https://www.japscan.foo/manga/-/?__cf_chl_rt_tk=short-lived-token' ]);
        expect(budget.used).toBe(1);
        // The reload must never ask for another browser window: `Open()` is what the DRM provider
        // and the connector answer a failed challenge with, and the loop the user reported comes
        // precisely from those successive windows.
        expect(fake.opened).toBe(0);
    });

    it('Should keep counting the reloads of a single window', async () => {
        const fake = new FakeWindow();
        const budget = { used: 1 };

        await ReloadChallengeWindow(fake, budget);

        expect(budget.used).toBe(2);
        expect(fake.navigations).toEqual([ fake.currentURL.href ]);
        expect(fake.opened).toBe(0);
    });
});

/** Window double: lets the test drive document loads and script injections by hand. */
class FakeWindow {

    public opened = 0;
    public shown = 0;
    public readonly domReady: (() => Promise<void>)[] = [];
    public readonly beforeNavigate: ((uri: URL) => Promise<null>)[] = [];
    public readonly injected: string[] = [];
    public readonly pending: { resolve: (value: unknown) => void, reject: (error: Error) => void }[] = [];
    /**
     * What the challenge probes report for the loaded document. `undefined` = an ordinary page,
     * which is what the flows not interested in challenges rely on.
     */
    public challenge: { isChallenge: boolean; hasRealWidget: boolean; cfMarkers?: string; age?: number; turnstileSolved?: boolean } | undefined;
    /** Value the CDP cookie read returns; assign a new one to simulate a fresh `cf_clearance`. */
    public clearance = '';
    /**
     * When set, challenge probes wait for it before answering: holds a poll round in flight so a
     * test can overtake it with a navigation, the way the field trace was overtaken (four survivor
     * rounds sharing one window).
     */
    public detectionGate: Promise<void> | undefined;
    /** Holds a stalled-reload probe after it has captured its document's challenge state. */
    public stalledDetectionGate: Promise<void> | undefined;
    public stalledDetectionCalls = 0;
    /** Override the age returned to the separate, time-driven stalled-reload poller. */
    public stalledChallengeAge: number | undefined;
    /** URLs this window was asked to navigate to (same window, no `Open()` involved). */
    public readonly navigations: string[] = [];
    /** Active challenge URL, including its ephemeral query string, for same-document reloads. */
    public currentURL = new URL('https://www.japscan.lol/manga/demo/12/');

    public get DOMReady(): { Subscribe: (handler: () => Promise<void>) => void } {
        return {
            Subscribe: (handler: () => Promise<void>) => {
                this.domReady.push(handler);
            },
        };
    }

    public get BeforeWindowNavigate(): { Subscribe: (handler: (uri: URL) => Promise<null>) => void } {
        return {
            Subscribe: (handler: (uri: URL) => Promise<null>) => {
                this.beforeNavigate.push(handler);
            },
        };
    }

    public async Open(request?: Request): Promise<void> {
        this.opened++;
        if (request) this.currentURL = new URL(request.url);
    }

    public async Show(): Promise<void> {
        this.shown++;
    }

    public async Close(): Promise<void> {
        return undefined;
    }

    public async SendDebugCommand<T>(method: string): Promise<T> {
        // `cf_clearance` is httpOnly: the flow reads it through `Network.getCookies` (CDP).
        if (method === 'Network.getCookies') {
            const value = this.clearance;
            return Promise.resolve({ cookies: value ? [ { name: 'cf_clearance', value } ] : [] } as unknown as T);
        }
        return { cookies: [] } as unknown as T;
    }

    public ExecuteScript<T>(script: string): Promise<T> {
        this.injected.push(script);
        if (script.includes(SCRIPT_MARKER)) {
            // The script under test hangs until the test settles it by hand.
            return new Promise<T>((resolve, reject) => this.pending.push({ resolve: value => resolve(value as T), reject }));
        }
        if (script.trim() === 'true') {
            return Promise.resolve(true as T);
        }
        // Same-window navigation requested by the flow: recorded instead of really navigating,
        // the test then simulates the document which loads by calling `Load()` again.
        if (script === 'window.location.reload()') {
            this.navigations.push(this.currentURL.href);
            return Promise.resolve(undefined as T);
        }
        // Challenge detection probes report what the test configured (an ordinary page by default).
        if (script.includes('isChallenge')) {
            const result = (this.challenge ?? { isChallenge: false, hasRealWidget: false }) as unknown as T;
            if (!script.includes('cfMarkers')) {
                // The age-driven stalled-reload probe does not return cfMarkers. Capture its
                // document before waiting so a test can reproduce a stale in-flight answer.
                this.stalledDetectionCalls++;
                const stalledResult = this.stalledChallengeAge === undefined ? result : { ...result, age: this.stalledChallengeAge };
                return this.stalledDetectionGate ? this.stalledDetectionGate.then(() => stalledResult as unknown as T) : Promise.resolve(stalledResult as unknown as T);
            }
            return this.detectionGate ? this.detectionGate.then(() => result) : Promise.resolve(result);
        }
        return Promise.resolve({ isChallenge: false, hasRealWidget: false } as unknown as T);
    }

    /** Loads a new document, which notifies the `DOMReady` subscribers (fire and forget). */
    public Load(): void {
        for (const handler of this.domReady) {
            void handler().catch((error: unknown) => console.error('[test] DOMReady handler failed', error));
        }
    }

    /** Announces a main-frame navigation to the subscribers (fire and forget). */
    public Navigate(uri: URL): void {
        for (const handler of this.beforeNavigate) {
            void handler(uri).catch((error: unknown) => console.error('[test] navigate handler failed', error));
        }
    }
}

/** Concrete provider so the fetch flow can be exercised without a real website. */
class TestProvider extends FetchProvider {

    protected async FetchCore(): Promise<Response> {
        throw new Error('not needed in this test');
    }
}

describe('CHALLENGE_WIDGET_PROBE', () => {

    /** Minimal element double: enough surface for the probe's frame/checkbox walk. */
    const element = (options: { tag?: string; src?: string; id?: string; className?: string; width?: number; height?: number; contentDocument?: unknown; shadowRoot?: unknown } = {}) => {
        const { tag = 'IFRAME', src, id = '', className = '', width = 300, height = 65, contentDocument, shadowRoot } = options;
        return {
            tagName: tag,
            id,
            className,
            getBoundingClientRect: () => ({ width, height }),
            getAttribute: (name: string) => name === 'src' ? src ?? null : null,
            contentDocument,
            shadowRoot,
        };
    };

    /**
     * The probe issues five distinct queries, each answered by its own bucket: the widget
     * selectors (frame walk), `*` (shadow roots), `body *` (covering overlay), the
     * challenge-looking selector list (`dump`) and the shallow body walk.
     */
    const root = (widgets: unknown[] = [], all: unknown[] = [], extra: { covering?: unknown[]; dump?: unknown[]; shallow?: unknown[] } = {}) => ({
        querySelectorAll: (selector: string) => {
            if (selector === '*') return all;
            if (selector === 'body *') return extra.covering ?? [];
            if (selector.startsWith('body >')) return extra.shallow ?? [];
            if (selector.startsWith('[id*=')) return extra.dump ?? [];
            return widgets;
        },
    });

    const run = (document: unknown, view?: unknown) => new Function('document', 'window', `return ${CHALLENGE_WIDGET_PROBE};`)(document, view) as { widget: boolean; frames: string; dom: string; age: number; announce: string };

    const turnstile = (width = 300, height = 65) => element({ src: 'https://challenges.cloudflare.com/turnstile/v0/g/abc', width, height });

    it('Should report no widget on a document without challenge controls', () => {
        const result = run(root());
        expect(result.widget).toBe(false);
        expect(result.frames).toBe('child=0');
        expect(result.dom).toBe('');
        expect(result.age).toBeGreaterThanOrEqual(0);
    });

    it('Should detect a visible Turnstile frame and expose it in the frame inventory', () => {
        const result = run(root([ turnstile() ]));
        expect(result.widget).toBe(true);
        expect(result.frames).toContain('child=1');
        expect(result.frames).toContain('300x65');
        expect(result.frames).toContain('challenges.cloudflare.com');
        expect(result.dom).toBe('');
    });

    it('Should neither report nor list an invisible widget frame as a widget', () => {
        const result = run(root([ turnstile(0, 0) ]));
        expect(result.widget).toBe(false);
        // A hidden frame is listed as such: knowing it exists is part of the diagnosis.
        expect(result.frames).toContain('0x0 (hidden)');
    });

    it('Should find the widget inside a nested same-origin frame', () => {
        const nested = element({ src: '', width: 1600, height: 900, contentDocument: root([ turnstile() ]) });
        const result = run(root([ nested ]));
        expect(result.widget).toBe(true);
        expect(result.frames).toContain('1600x900');
    });

    it('Should detect a rendered checkbox which no selector covers', () => {
        expect(run(root([ element({ tag: 'INPUT', width: 13, height: 13 }) ])).widget).toBe(true);
    });

    it('Should descend into a shadow root', () => {
        const host = { shadowRoot: root([ turnstile() ]) };
        expect(run(root([], [ host ])).widget).toBe(true);
    });

    it('Should treat a viewport-covering positioned layer as the blocking widget', () => {
        const overlay = element({ tag: 'DIV', id: 'jc-overlay', className: 'security-layer', width: 1280, height: 720 });
        const view = { innerWidth: 1280, innerHeight: 720, getComputedStyle: () => ({ position: 'fixed' }) };
        const result = run(root([], [], { covering: [ overlay ] }), view);
        expect(result.widget).toBe(true);
        expect(result.dom).toContain('overlay');
        expect(result.dom).toContain('div#jc-overlay');
    });

    it('Should not treat a covering layer without a positioning scheme as a widget', () => {
        const wrapper = element({ tag: 'DIV', id: 'cf-wrapper', width: 1280, height: 720 });
        const view = { innerWidth: 1280, innerHeight: 720, getComputedStyle: () => ({ position: 'static' }) };
        expect(run(root([], [], { covering: [ wrapper ] }), view).widget).toBe(false);
    });

    it('Should name the challenge-looking elements when no widget is found', () => {
        const overlay = element({ tag: 'DIV', id: 'jc-overlay', width: 400, height: 200 });
        const result = run(root([], [], { dump: [ overlay ] }));
        expect(result.widget).toBe(false);
        expect(result.dom).toContain('div#jc-overlay 400x200');
    });

    it('Should report the pending-challenge flags the page announces before rendering', () => {
        // JapScan announces its puzzle through `window.__captcha` while Cloudflare boots with
        // an options object: both are the proof that a challenge is coming, which is exactly
        // what a bare `widget=false` on an empty body cannot tell apart from no challenge.
        expect(run(root(), { __captcha: { needed: true } }).announce).toBe('captcha=true');
        expect(run(root(), { __cf_chl_opt: { cRay: 'x' } }).announce).toBe('cf-chl=1');
        expect(run(root(), { __captcha: { needed: false }, _cf_chl_opt: {} }).announce).toBe('captcha=false cf-chl=1');
        expect(run(root(), {}).announce).toBe('');
    });

    it('Should mark the hidden challenge-looking elements and list the visible ones first', () => {
        const leftover = element({ tag: 'INPUT', width: 0, height: 0 });
        const overlay = element({ tag: 'DIV', id: 'jc-overlay', width: 400, height: 200 });
        // Document order puts the leftover hidden container first; the dump must not let it
        // push the rendered markup out, or the trace would blame a solved interstitial.
        const result = run(root([], [], { dump: [ leftover, overlay ] }));
        expect(result.dom).toContain('input 0x0 (hidden)');
        expect(result.dom).toContain('div#jc-overlay 400x200');
        expect(result.dom.indexOf('div#jc-overlay')).toBeLessThan(result.dom.indexOf('(hidden)'));
    });

    it('Should list the Cloudflare challenge resources with their source', () => {
        // The source answers what a bare tag+size cannot: whether the Turnstile bootstrap was
        // at least requested. A document whose dump mentions no `challenges.cloudflare.com`
        // resource never even asked for a widget, which is a different failure than "asked,
        // refused" and points at the network/CDN rather than at the widget detection.
        const script = element({ tag: 'SCRIPT', src: 'https://challenges.cloudflare.com/turnstile/v0/api.js', width: 0, height: 0 });
        const result = run(root([], [], { dump: [ script ] }));
        expect(result.widget).toBe(false);
        expect(result.dom).toContain('script 0x0');
        expect(result.dom).toContain('challenges.cloudflare.com/turnstile');
        expect(result.dom).toContain('(hidden)');
    });
});

describe('FetchWindowPreloadScript (script recovery)', () => {

    let warn: MockInstance<typeof console.warn>;

    beforeEach(() => {
        warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    const logged = (): string => warn.mock.calls.map(args => args.join(' ')).join('\n');

    /** Waits on native timers until the probe holds, and reports the whole state otherwise. */
    const waitFor = async (label: string, probe: () => boolean, state: () => Record<string, unknown>): Promise<void> => {
        for (let attempt = 0; attempt < 100; attempt++) {
            if (probe()) {
                return;
            }
            await new Promise<void>(resolve => setTimeout(resolve, 20));
        }
        throw new Error(`${label} never became true: ${JSON.stringify({ ...state(), log: logged() })}`);
    };

    const windowState = (fake: FakeWindow): Record<string, unknown> => ({
        domReady: fake.domReady.length,
        navigate: fake.beforeNavigate.length,
        injected: fake.injected.length,
        pending: fake.pending.length,
    });

    /**
     * Starts a fetch on the given window and waits until the script hangs inside it.
     * The promise is returned inside a container: returning it directly from this `async`
     * helper would make it adopt the fetch's state, which by design never settles here.
     */
    const startFetch = async (fake: FakeWindow): Promise<{ fetch: Promise<{ links: string[] }> }> => {
        harness.window = fake;
        const provider = new TestProvider();
        provider.Initialize({ VerboseFetchWindow: { Value: false } } as unknown as FeatureFlags);
        const fetch = provider.FetchWindowPreloadScript<{ links: string[] }>(new Request('https://www.japscan.lol/manga/demo/12/'), '', `${SCRIPT_MARKER} void 0;`, 0, 5_000, false);
        await waitFor('DOMReady subscription', () => fake.domReady.length === 1, () => windowState(fake));
        fake.Load();
        await waitFor('first script injection', () => fake.pending.length === 1, () => windowState(fake));
        return { fetch };
    };

    it('Should dispatch the script again when a navigation replaced its document', async () => {
        const fake = new FakeWindow();
        const { fetch } = await startFetch(fake);
        expect(logged()).toContain('runScript: executing attempt=1');

        // The site navigates a few seconds later, destroying the script's execution context.
        fake.Navigate(new URL('https://www.japscan.lol/manga/demo/12/'));
        expect(logged()).toContain('main frame navigated to https://www.japscan.lol/manga/demo/12/ while attempt=1 was pending');

        // The document which replaced it must re-dispatch the script instead of waiting forever.
        fake.Load();
        await waitFor('second script injection', () => fake.pending.length === 2, () => windowState(fake));
        expect(logged()).toContain('document replaced while attempt=1 was pending, re-dispatching');
        expect(logged()).toContain('runScript: executing attempt=2');
        expect(fake.opened).toBe(1);

        // The second attempt delivers the result...
        let outcome: unknown = 'pending';
        void fetch.then(value => { outcome = value; }, error => { outcome = { error: String(error) }; });
        fake.pending[1].resolve({ links: [ 'https://www.japscan.lol/img/1.jpg' ] });
        await waitFor('fetch resolution', () => outcome !== 'pending', () => windowState(fake));
        expect(outcome).toEqual({ links: [ 'https://www.japscan.lol/img/1.jpg' ] });
        expect(logged()).toContain('returned attempt=2');

        // ...and the abandoned first attempt cannot settle or fail the request anymore.
        fake.pending[0].reject(new Error('Render frame was disposed'));
        await waitFor('stale attempt discarded', () => logged().includes('attempt=1 superseded, discarding its failure'), () => windowState(fake));
    });

    it('Should still fail the fetch when the script errors without a navigation', async () => {
        const fake = new FakeWindow();
        const { fetch } = await startFetch(fake);
        let failure: unknown = 'pending';
        void fetch.then(() => { failure = 'resolved'; }, error => { failure = String(error); });

        fake.pending[0].reject(new Error('boom'));

        await waitFor('fetch rejection', () => failure !== 'pending', () => windowState(fake));
        expect(failure).toContain('boom');
        expect(logged()).toContain('[KUMO] runScript error:');
        expect(logged()).not.toContain('re-dispatching');
    });
});

describe('Fetch (Cloudflare challenge recovery)', () => {

    let warn: MockInstance<typeof console.warn>;

    beforeEach(() => {
        warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    const logged = (): string => warn.mock.calls.map(args => args.join(' ')).join('\n');

    /** Waits on native timers until the probe holds, reporting the log when it never does. */
    const waitFor = async (label: string, probe: () => boolean, state: () => Record<string, unknown>, attempts = 100): Promise<void> => {
        for (let attempt = 0; attempt < attempts; attempt++) {
            if (probe()) {
                return;
            }
            await new Promise<void>(resolve => setTimeout(resolve, 20));
        }
        throw new Error(`${label} never became true: ${JSON.stringify({ ...state(), log: logged() })}`);
    };

    const windowState = (fake: FakeWindow): Record<string, unknown> => ({
        domReady: fake.domReady.length,
        shown: fake.shown,
        injected: fake.injected.length,
    });

    /** A native fetch which Cloudflare rejects until the test releases it. */
    class BlockedProvider extends FetchProvider {
        public attempts = 0;
        public released = false;
        public postRecoveryFailures = 0;
        protected async FetchCore(): Promise<Response> {
            this.attempts++;
            if (!this.released || this.postRecoveryFailures-- > 0) {
                throw new Exception(R.FetchProvider_Fetch_Forbidden, 'https://www.japscan.lol/manga/demo/');
            }
            return new Response('<html><body>ok</body></html>', { status: 200 });
        }
    }

    /** Cloudflare challenge page served with HTTP 200 (structural markers only). */
    const CHALLENGE_PAGE = '<!DOCTYPE html><html><head><script src="/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1"></script></head><body><form id="challenge-form"></form></body></html>';

    const createProvider = <T extends FetchProvider>(provider: T): T => {
        provider.Initialize({ VerboseFetchWindow: { Value: false } } as unknown as FeatureFlags);
        return provider;
    };

    it('Should resolve the challenge in the plugin window and retry the request without asking again', async () => {
        const fake = new FakeWindow();
        fake.challenge = { isChallenge: true, hasRealWidget: true, cfMarkers: '.cf-turnstile', age: 20_000 };
        fake.clearance = PERSISTED;
        harness.window = fake;
        const provider = createProvider(new BlockedProvider());

        const pending = provider.Fetch(new Request('https://www.japscan.lol/manga/demo/'));
        await waitFor('window DOMReady subscription', () => fake.domReady.length === 1, () => windowState(fake));
        fake.Load();
        // The real page is reached inside the challenge window, and Cloudflare issues a new
        // clearance. Model the user finishing the plugin validation before HTTP accepts it.
        await waitFor('interactive plugin window', () => fake.shown > 0, () => windowState(fake), 250);
        fake.challenge = undefined;
        fake.clearance = FRESH;
        provider.released = true;
        // Reproduce the report: the initial request and first retry are still denied after the
        // solve, but the next request succeeds without opening another challenge window.
        provider.postRecoveryFailures = 2;
        fake.Load();

        const response = await pending;
        expect(response.status).toBe(200);
        expect(provider.attempts).toBe(4);
        expect(fake.opened).toBe(1);
        expect(fake.shown).toBeGreaterThan(0);
        expect(fake.injected).toContain('true');
        expect(logged()).toContain('retrying after challenge recovery');
        expect(logged()).toContain('request still challenged after plugin validation, retrying in');
    }, 15_000);

    it('Should reuse a plugin-resolved JapScan challenge before the first blocked HTTP request', async () => {
        const fake = new FakeWindow();
        fake.challenge = { isChallenge: true, hasRealWidget: true, cfMarkers: '.cf-turnstile', age: 20_000 };
        fake.clearance = PERSISTED;
        harness.window = fake;
        const provider = createProvider(new BlockedProvider());

        // Match the user's sequence: start in the plugin window, solve there, THEN load the manga
        // list. That later HTTP request must not open another captcha window.
        const validation = provider.FetchWindowPreloadScript(new Request('https://www.japscan.lol/manga/demo/'), '', 'true', 0, 60_000, false);
        await waitFor('plugin challenge window', () => fake.domReady.length === 1, () => windowState(fake));
        fake.Load();
        await waitFor('visible plugin challenge', () => fake.shown > 0, () => windowState(fake), 250);
        fake.challenge = undefined;
        fake.clearance = FRESH;
        fake.Load();
        await validation;

        provider.released = true;
        provider.postRecoveryFailures = 2;
        const response = await provider.Fetch(new Request('https://www.japscan.lol/manga/demo/'));

        expect(response.status).toBe(200);
        // released=true before Fetch, so the initial attempt consumes one post-recovery denial,
        // then two more inside the retry grace — three calls total, one window total.
        expect(provider.attempts).toBe(3);
        expect(fake.opened).toBe(1);
        expect(logged()).toContain('retrying after recent plugin challenge resolution');
        expect(logged()).not.toContain('retrying after challenge recovery for https://www.japscan.lol/manga/demo/');
    }, 20_000);

    it('Should propagate the error without a window for sites without the fork challenge handling', async () => {
        const fake = new FakeWindow();
        harness.window = fake;
        const provider = createProvider(new BlockedProvider());

        await expect(provider.Fetch(new Request('https://example.com/manga/demo/'))).rejects.toThrow();
        expect(provider.attempts).toBe(1);
        expect(fake.opened).toBe(0);
    });

    it('Should keep the cooldown from popping a second window for repeated failures', async () => {
        const fake = new FakeWindow();
        harness.window = fake;
        const provider = createProvider(new BlockedProvider());

        const first = provider.Fetch(new Request('https://www.crunchyscan.org/manga/demo/'));
        await waitFor('window DOMReady subscription', () => fake.domReady.length === 1, () => windowState(fake));
        fake.Load();
        await expect(first).rejects.toThrow();
        expect(fake.opened).toBe(1);
        expect(provider.attempts).toBe(2);

        await expect(provider.Fetch(new Request('https://www.crunchyscan.org/manga/demo/'))).rejects.toThrow();
        expect(fake.opened).toBe(1);
        expect(provider.attempts).toBe(3);
        // Hosts without JapScan's post-validation retry grace retain the original one-retry
        // behavior and cooldown, so this protection cannot silently become global.
        expect(logged()).not.toContain('request still challenged after plugin validation');
    });

    it('Should join an in-flight recovery instead of opening a second window', async () => {
        const fake = new FakeWindow();
        harness.window = fake;
        const provider = createProvider(new BlockedProvider());

        const first = provider.Fetch(new Request('https://www.crunchyscan.org/manga/demo/'));
        await waitFor('window DOMReady subscription', () => fake.domReady.length === 1, () => windowState(fake));
        const second = provider.Fetch(new Request('https://www.crunchyscan.org/manga/demo/'));
        fake.Load();

        await expect(first).rejects.toThrow();
        await expect(second).rejects.toThrow();
        expect(fake.opened).toBe(1);
        expect(provider.attempts).toBe(4);
    });

    it('Should recover when Cloudflare serves its challenge page with a success status', async () => {
        const fake = new FakeWindow();
        harness.window = fake;

        class ChallengeProvider extends FetchProvider {
            public attempts = 0;
            public postRecoveryFailures = 0;
            protected async FetchCore(): Promise<Response> {
                this.attempts++;
                if (this.attempts > 1 && this.postRecoveryFailures-- > 0) {
                    throw new Exception(R.FetchProvider_Fetch_Forbidden, 'https://www.japscan.lol/manga/demo/');
                }
                return new Response(this.attempts === 1 ? CHALLENGE_PAGE : '<html><head></head><body>real</body></html>', { status: 200 });
            }
        }
        const provider = createProvider(new ChallengeProvider());
        // The test environment has no DOM: a stand-in parser is enough to observe the retry.
        const DocumentParser = function (): unknown {
            return {
                parseFromString: () => ({
                    head: { querySelector: () => null },
                    body: { querySelectorAll: () => [] },
                }),
            };
        };
        vi.stubGlobal('DOMParser', DocumentParser);

        try {
            const pending = provider.FetchHTML(new Request('https://www.japscan.lol/manga/demo/'));
            await waitFor('window DOMReady subscription', () => fake.domReady.length === 1, () => windowState(fake));
            // Plugin validation may finish before the origin starts accepting the new cookie.
            provider.postRecoveryFailures = 2;
            fake.Load();
            await pending;
            expect(provider.attempts).toBe(4);
            expect(fake.opened).toBe(1);
            expect(logged()).toContain('FetchHTML: request still challenged after plugin validation, retrying in');
            expect(logged()).toContain('challenge page detected, retrying after recovery');
        } finally {
            vi.unstubAllGlobals();
        }
    });
});

// The setup file hands out the native timer functions, captured when its mock factory ran. The
// clearance-reload run below drives the poller with fake timers, so these wrappers must resolve
// the global timers at CALL time instead of capturing them once.
vi.mock('../BackgroundTimers', () => ({
    SetTimeout: (callback: () => void, ms: number) => new Promise<number>(resolve => resolve(setTimeout(callback, ms) as unknown as number)),
    ClearTimeout: (timerID: number) => clearTimeout(timerID as unknown as ReturnType<typeof setTimeout>),
    Delay: (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)),
}));

// A second distinct clearance: each reload baselines the cookie of the document it serves, so
// every reload needs a value this poller has not read yet.
const SECOND = `second-${'c'.repeat(MIN_CLEARANCE_LENGTH)}`;

/**
 * Drives the whole challenge window flow — DOMReady, classification, poller, reload — which the
 * pure `PlanClearanceReload` tests can not prove: the reload must reach the window already open,
 * the counter must survive the `DOMReady` it triggers, and the error must reach the caller. The
 * clock is faked because one poll round costs 4 s (and the classification a 2.5 s grace before
 * it), which a real-timer test could not afford.
 */
describe('PollForChallengeResolution (bounded clearance reload)', () => {

    let warn: MockInstance<typeof console.warn>;

    beforeEach(() => {
        vi.useFakeTimers();
        warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        // The challenge window budget is module-wide (that is what lets it bound a loop across
        // windows): every test starts from a fresh one, so the number of windows it opens is its own.
        ResetChallengeWindowBudgets();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    const logged = (): string => warn.mock.calls.map(args => args.join(' ')).join('\n');

    /**
     * The per-origin budget trace, one entry per window which SPENT it, i.e. which ended on a
     * still-current challenge. A window whose challenge resolved must never appear here.
     */
    const challengeWindowLines = (): string[] => warn.mock.calls
        .map(args => String(args[0]))
        .filter(line => line.includes('unresolved challenge window #'));

    /** Runs the fake clock, letting the async chain (awaits, backoffs, retries) progress. */
    const pump = async (ms: number): Promise<void> => {
        // The poller schedules its next timer only after several asynchronous CDP/probe awaits.
        // Jumping 30-150 s in one call skips timers created by those microtasks in Vitest, making
        // a logically due poll appear to have never run; step longer waits like a real event loop.
        const step = ms > 1_000 ? 1_000 : ms;
        for (let elapsed = 0; elapsed < ms; elapsed += step) {
            await vi.advanceTimersByTimeAsync(Math.min(step, ms - elapsed));
        }
    };

    const CHALLENGE_URL = 'https://www.japscan.lol/manga/demo/12/';

    /**
     * Starts a fetch on a window serving the Cloudflare interstitial of the given site.
     * The promise is returned inside a container: returning it directly from this `async` helper
     * would make it adopt the fetch's state, which by design never settles within the helper.
     */
    const startChallenge = async (fake: FakeWindow, url = CHALLENGE_URL, challenge: NonNullable<FakeWindow['challenge']> = { isChallenge: true, hasRealWidget: true, cfMarkers: '.cf-turnstile', age: 20_000 }, timeout = 60_000): Promise<{ fetch: Promise<{ links: string[] }> }> => {
        fake.challenge = challenge;
        fake.clearance = PERSISTED;
        fake.currentURL = new URL(url);
        harness.window = fake;
        const provider = new TestProvider();
        provider.Initialize({ VerboseFetchWindow: { Value: false } } as unknown as FeatureFlags);
        const fetch = provider.FetchWindowPreloadScript<{ links: string[] }>(new Request(url), '', `${SCRIPT_MARKER} void 0;`, 0, timeout, false);
        await pump(0);
        fake.Load();
        // 2.5 s classification grace, then the poller's own 4 s first round.
        await pump(3_000);
        return { fetch };
    };

    /**
     * Lets one poll round observe the unchanged clearance of the current document (which must
     * never reload anything), then issues a fresh clearance and lets the next round read it.
     * The document also gains its completed turnstile response: that token is what makes JapScan's
     * clearance gate (ShouldRequireSolveToken) trust the change as a real user validation — without
     * it the change is read as Cloudflare's render-time rotation and arms nothing.
     * @param before - Reloads the window must have performed before that fresh clearance.
     */
    const issueClearance = async (fake: FakeWindow, value: string, before: number): Promise<void> => {
        await pump(4_000);
        expect(fake.navigations).toHaveLength(before);
        if (fake.challenge) fake.challenge = { ...fake.challenge, turnstileSolved: true };
        fake.clearance = value;
        await pump(4_000);
    };

    /**
     * The sites which measured the SAME stall: Cloudflare issues a fresh `cf_clearance` for the
     * interstitial and never redirects it (JapScan, and CrunchyScan where it was documented first —
     * CLOUDFLARE.md §7). Both must be restarted the same way, bounded by the reload budget: the
     * sites which never showed it are guarded by `JapScan_test.ts` / `CrunchyScan_test.ts`.
     */
    const CLEARANCE_RELOAD_SITES = [
        { name: 'JapScan', url: CHALLENGE_URL },
        { name: 'CrunchyScan', url: 'https://www.crunchyscan.org/lecture-en-ligne/demo/' },
    ];

    it('Should extract without reloading when a solved page retains Cloudflare markup', async () => {
        const fake = new FakeWindow();
        const { fetch } = await startChallenge(fake);

        // The site now serves the real page but leaves a hidden Turnstile node in the DOM. The
        // old logic equated `cleared` with "fresh cf_clearance" and marker presence with "still
        // challenge", reloading the just-unlocked reader page and restarting the loop.
        fake.challenge = { isChallenge: false, hasRealWidget: false, cfMarkers: '.cf-turnstile', age: 20_000 };
        fake.clearance = FRESH;
        for (let elapsed = 0; elapsed < 15_000 && fake.pending.length === 0; elapsed += 250) {
            await pump(250);
        }

        expect(fake.pending).toHaveLength(1);
        expect(fake.navigations).toHaveLength(0);
        expect(logged()).not.toContain('cf_clearance issued but the challenge (.cf-turnstile) is still the current document');
        fake.pending[0].resolve({ links: [ `${CHALLENGE_URL}#page-1` ] });
        await expect(fetch).resolves.toEqual({ links: [ `${CHALLENGE_URL}#page-1` ] });
    });

    it('Should not extend JapScan validation grace when Cloudflare rotates clearance cookies', async () => {
        const fake = new FakeWindow();
        const { fetch } = await startChallenge(fake, CHALLENGE_URL);

        // Cloudflare issues intermediate cf_clearance values while its validation is still
        // running. Each one is a new cookie, but it must not restart the one-minute grace.
        await issueClearance(fake, FRESH, 0);
        expect(fake.navigations).toHaveLength(0);
        await pump(36_000);
        fake.clearance = SECOND;
        await pump(4_000);
        expect(fake.navigations, logged()).toHaveLength(0);
        // Keep stepping the async timer chain: Vitest cannot schedule a poll which an earlier
        // ExecuteScript/CDP microtask has not armed yet during one large clock jump.
        for (let elapsed = 0; elapsed < 30_000 && fake.navigations.length === 0; elapsed += 1_000) {
            await pump(1_000);
        }
        expect(fake.navigations, logged()).toEqual([ CHALLENGE_URL ]);
        expect(fake.opened).toBe(1);

        fake.challenge = undefined;
        fake.Load();
        await pump(3_000);
        expect(fake.pending).toHaveLength(1);
        fake.pending[0].resolve({ links: [ `${CHALLENGE_URL}#page-1` ] });
        await expect(fetch).resolves.toEqual({ links: [ `${CHALLENGE_URL}#page-1` ] });
    });

    it('Should preserve the active JapScan Cloudflare token during its clearance-driven reload', async () => {
        const challengeURL = 'https://www.japscan.lol/manga/-/?__cf_chl_rt_tk=short-lived-token';
        const fake = new FakeWindow();
        const { fetch } = await startChallenge(fake, challengeURL);

        await issueClearance(fake, FRESH, 0);
        expect(fake.navigations).toHaveLength(0);
        // Keep the document stable for JapScan's server-side validation cycle (including poll
        // observation latency), then reload this exact challenge URL if no redirect lands.
        await pump(90_000);
        expect(fake.navigations).toEqual([ challengeURL ]);
        expect(fake.opened).toBe(1);

        fake.challenge = undefined;
        fake.Load();
        await pump(3_000);
        fake.pending[0].resolve({ links: [ `${challengeURL}#page-1` ] });
        await expect(fetch).resolves.toEqual({ links: [ `${challengeURL}#page-1` ] });
    });

    it('Should not time-reload a JapScan challenge when the widget probe misses the active control', async () => {
        const fake = new FakeWindow();
        const { fetch } = await startChallenge(fake, CHALLENGE_URL, {
            isChallenge: true,
            hasRealWidget: false,
            cfMarkers: 'script[src*="cdn-cgi/challenge-platform"]',
            age: 12_644,
        }, 180_000);

        // Reproduction of the attached trace: the interactive detector says JapScan is still
        // challenged, the deep widget probe misses the visible checkbox (`widget=false`), and the
        // time-driven poller concludes that nothing rendered once age exceeds 12 s. A clearance
        // rotation without a solve token must not let that unrelated poller reset the challenge.
        // First let DOMReady's CDP baseline finish and the initial poll observe the persisted cookie.
        await pump(4_000);
        fake.clearance = FRESH;
        await pump(15_000);

        expect(logged()).toContain('clr=rotated');
        expect(logged()).not.toContain('ReloadStalledCloudFlareChallenge: reload');
        expect(fake.navigations, logged()).toHaveLength(0);
        expect(fake.opened).toBe(1);
        expect(fake.pending).toHaveLength(0);
        expect(ShouldUseStalledChallengeReload(CHALLENGE_URL)).toBe(false);

        // The user can still solve it: a completed token plus a fresh cookie arms the separately
        // bounded clearance path, which waits JapScan's validation grace before reloading. First
        // observe the accepted solve and its 60 s grace separately from the eventual navigation.
        fake.challenge = { isChallenge: true, hasRealWidget: false, cfMarkers: 'script[src*="cdn-cgi/challenge-platform"]', age: 20_000, turnstileSolved: true };
        fake.clearance = SECOND;
        for (let elapsed = 0; elapsed < 20_000 && !logged().includes('clr=changed'); elapsed += 1_000) {
            await pump(1_000);
        }
        expect(logged()).toContain('clr=changed cleared=true');
        expect(logged()).toContain('waiting 60000ms for Cloudflare to finish its validation');
        expect(fake.navigations).toHaveLength(0);
        expect(logged()).not.toContain('ReloadStalledCloudFlareChallenge: reload');
        for (let elapsed = 0; elapsed < 75_000 && fake.navigations.length === 0; elapsed += 1_000) {
            await pump(1_000);
        }
        expect(fake.navigations, logged()).toEqual([ CHALLENGE_URL ]);
        expect(logged()).toContain('cf_clearance issued but the challenge (script[src*="cdn-cgi/challenge-platform"]) is still the current document, reload #1/2');
        fake.challenge = undefined;
        fake.Load();
        await pump(3_000);
        expect(fake.pending).toHaveLength(1);
        fake.pending[0].resolve({ links: [ `${CHALLENGE_URL}#page-1` ] });
        await expect(fetch).resolves.toEqual({ links: [ `${CHALLENGE_URL}#page-1` ] });
        expect(fake.opened).toBe(1);
    });

    it('Should keep waiting on a cookie rotation which carries no turnstile token (JapScan)', async () => {
        const fake = new FakeWindow();
        const { fetch } = await startChallenge(fake, CHALLENGE_URL);

        // Field trace behind the gate: a fresh JapScan window reports `clr=changed` seconds after
        // its load while the document still renders the challenge and carries NO completed
        // turnstile response — Cloudflare rotating cf_clearance during the render, not a solve.
        // Arming the bounded reload cycle on that rotation burned both reloads and killed the
        // window on `survived 2/2 reloads, giving up` while its interactive budget still had a
        // minute left for the user to click.
        await pump(4_000);
        expect(fake.navigations).toHaveLength(0);
        fake.clearance = FRESH;
        for (let elapsed = 0; elapsed < 20_000 && !logged().includes('clr=rotated'); elapsed += 1_000) {
            await pump(1_000);
        }
        // A few further rounds: an armed cycle would be printing its validation countdown from the
        // very round which observed the change, so its absence here proves nothing was armed —
        // without eating the window's 150 s interactive budget the armed phase below still needs.
        await pump(15_000);
        expect(logged()).toContain('clr=rotated');
        expect(logged()).toContain('clr=unchanged');
        expect(logged()).not.toContain('cf_clearance issued but');
        expect(logged()).not.toContain('cf_clearance issued, waiting');
        expect(fake.navigations, logged()).toHaveLength(0);
        expect(fake.opened).toBe(1);
        expect(fake.pending).toHaveLength(0);

        // The user's validation is what arms the recovery: the document now carries the completed
        // turnstile response, a fresh clearance follows, and the bounded reload cycle starts from
        // THIS change — its one-minute JapScan grace included.
        fake.challenge = { ...(fake.challenge as NonNullable<FakeWindow['challenge']>), turnstileSolved: true };
        fake.clearance = SECOND;
        for (let elapsed = 0; elapsed < 90_000 && fake.navigations.length === 0; elapsed += 1_000) {
            await pump(1_000);
        }
        expect(fake.navigations, logged()).toEqual([ CHALLENGE_URL ]);
        expect(logged()).toContain(`reload #1/${MAX_CLEARANCE_RELOADS}`);

        // The reloaded document still challenges — the same window serves the reader after it:
        // extraction runs, exactly one window total.
        fake.challenge = undefined;
        fake.Load();
        await pump(3_000);
        expect(fake.pending).toHaveLength(1);
        fake.pending[0].resolve({ links: [ `${CHALLENGE_URL}#page-1` ] });
        await expect(fetch).resolves.toEqual({ links: [ `${CHALLENGE_URL}#page-1` ] });
        expect(fake.opened).toBe(1);
    });

    it('Should discard an in-flight stalled-reload probe after the clearance poller takes over', async () => {
        const fake = new FakeWindow();
        const url = 'https://www.crunchyscan.org/lecture-en-ligne/demo/';
        const { fetch } = await startChallenge(fake, url);

        // Let the time-driven poller observe the widget once. Its next check captures a stale
        // challenge answer, then waits in ExecuteScript while the user finishes the challenge.
        for (let elapsed = 0; elapsed < 8_000 && fake.stalledDetectionCalls < 1; elapsed += 250) {
            await pump(250);
        }
        expect(fake.stalledDetectionCalls).toBeGreaterThanOrEqual(1);
        fake.challenge = { isChallenge: true, hasRealWidget: false, cfMarkers: '.cf-turnstile', age: 20_000 };

        let releaseStalledProbe: () => void = () => undefined;
        fake.stalledDetectionGate = new Promise<void>(resolve => { releaseStalledProbe = resolve; });
        for (let elapsed = 0; elapsed < 15_000 && fake.stalledDetectionCalls < 2; elapsed += 250) {
            await pump(250);
        }
        expect(fake.stalledDetectionCalls).toBeGreaterThanOrEqual(2);

        // The clearance poller sees a freshly issued cookie on the still-current challenge and
        // performs its one intended reload. It stops the time-driven poller while that poller's
        // old probe answer is still pending.
        fake.clearance = FRESH;
        await pump(CLEARANCE_NAVIGATION_GRACE);
        for (let elapsed = 0; elapsed < 15_000 && fake.navigations.length === 0; elapsed += 250) {
            await pump(250);
        }
        expect(fake.navigations).toEqual([ url ]);
        releaseStalledProbe();
        await pump(0);
        expect(fake.navigations).toHaveLength(1);
        expect(logged()).not.toContain('ReloadStalledCloudFlareChallenge: reload');

        // The next request serves the real reader page, although a hidden Turnstile marker can
        // linger. Neither marker residue nor the spent clearance budget should navigate it away.
        fake.challenge = { isChallenge: false, hasRealWidget: false, cfMarkers: '.cf-turnstile', age: 20_000 };
        fake.Load();
        for (let elapsed = 0; elapsed < 15_000 && fake.pending.length === 0; elapsed += 250) {
            await pump(250);
        }
        expect(fake.pending).toHaveLength(1);
        expect(fake.navigations).toHaveLength(1);
        fake.pending[0].resolve({ links: [ `${url}#page-1` ] });
        await expect(fetch).resolves.toEqual({ links: [ `${url}#page-1` ] });
    });

    for (const site of CLEARANCE_RELOAD_SITES) {
        it(`Should reload the same window, at most twice, and extract once the document changes (${site.name})`, async () => {
            const fake = new FakeWindow();
            const { fetch } = await startChallenge(fake, site.url);

            // The clearance present at load time proves nothing (round 1 observes it unchanged and
            // must not reload); then the user validates and Cloudflare issues a fresh one. The cookie
            // is only honoured on the NEXT request, so the interstitial remains until the
            // site-specific validation grace expires; then reload the SAME window instead of
            // injecting the extraction script onto the challenge page (the old empty "0 items" loop).
            await issueClearance(fake, FRESH, 0);
            expect(fake.navigations).toHaveLength(0);
            await pump(90_000);
            expect(fake.navigations).toEqual([ site.url ]);
            expect(fake.pending).toHaveLength(0);
            expect(logged()).toContain(`cf_clearance issued but the challenge (.cf-turnstile) is still the current document, reload #1/${MAX_CLEARANCE_RELOADS}`);
            // The time-driven stalled-reload poller must not restart the document being validated.
            expect(logged()).not.toContain('ReloadStalledCloudFlareChallenge: reload');

            // The first reload still served the interstitial. The document which replaced it is
            // young — `performance.now()` restarts on every navigation — so it may neither be
            // reloaded nor failed while it renders, whatever the cookie does in the meantime.
            fake.challenge = { isChallenge: true, hasRealWidget: true, cfMarkers: '.cf-turnstile', age: 950 };
            fake.Load();
            await pump(3_000);
            await issueClearance(fake, SECOND, 1);
            expect(fake.navigations).toHaveLength(1);
            await pump(CLEARANCE_NAVIGATION_GRACE);
            expect(fake.navigations).toEqual([ site.url ]);
            expect(logged()).toContain(`challenge document is only 950ms old, waiting ${CHALLENGE_WIDGET_RENDER_GRACE}ms before judging it`);

            // Aged past the render grace and still the challenge: the window-scoped memory of the
            // solve — the poller rebuilt by that navigation baselined the cookie away — plans the
            // measured second reload.
            fake.challenge = { isChallenge: true, hasRealWidget: true, cfMarkers: '.cf-turnstile', age: 20_000 };
            await pump(12_000 + 60_000);
            expect(fake.navigations).toEqual([ site.url, site.url ]);
            expect(logged()).toContain(`reload #2/${MAX_CLEARANCE_RELOADS}`);

            // The second reload serves the reader page: the extraction runs, no third navigation.
            fake.challenge = undefined;
            fake.Load();
            await pump(3_000);
            expect(fake.pending).toHaveLength(1);
            fake.pending[0].resolve({ links: [ `${site.url}#page-1` ] });
            await expect(fetch).resolves.toEqual({ links: [ `${site.url}#page-1` ] });
            expect(fake.navigations).toHaveLength(2);
            // One window for the whole validation: never the extra window the loop was made of.
            expect(fake.opened).toBe(1);
        });

        it(`Should raise a Cloudflare error when two reloads leave the challenge in place (${site.name})`, async () => {
            const fake = new FakeWindow();
            const { fetch } = await startChallenge(fake, site.url);
            let failure: unknown = 'pending';
            void fetch.then(() => { failure = 'resolved'; }, error => { failure = String(error); });

            await issueClearance(fake, FRESH, 0);
            await pump(90_000);
            expect(fake.navigations).toHaveLength(1);
            // Each document this window loads starts young: the second one defers the judgement
            // until it reaches the render grace, and only then the memory of the solve reloads it.
            fake.challenge = { isChallenge: true, hasRealWidget: true, cfMarkers: '.cf-turnstile', age: 950 };
            fake.Load();
            await pump(3_000);
            await issueClearance(fake, SECOND, 1);
            expect(fake.navigations).toHaveLength(1);
            fake.challenge.age = 20_000;
            await pump(60_000);
            expect(fake.navigations).toHaveLength(2);
            fake.challenge = { isChallenge: true, hasRealWidget: true, cfMarkers: '.cf-turnstile', age: 20_000 };
            await pump(12_000 + 60_000);
            expect(fake.navigations).toHaveLength(MAX_CLEARANCE_RELOADS);

            // Third clearance on a still-challenged document: the budget is spent, so the error
            // reaches the caller instead of a silent 150 s window timeout (which the connector
            // answers by opening one more window — the reported loop). Its document is young
            // again: the failure is deferred exactly like the reloads above.
            fake.challenge = { isChallenge: true, hasRealWidget: true, cfMarkers: '.cf-turnstile', age: 950 };
            fake.Load();
            await pump(3_000);
            await issueClearance(fake, `third-${'d'.repeat(MIN_CLEARANCE_LENGTH)}`, MAX_CLEARANCE_RELOADS);
            expect(failure).toBe('pending');
            expect(logged()).not.toContain('giving up');

            fake.challenge = { isChallenge: true, hasRealWidget: true, cfMarkers: '.cf-turnstile', age: 20_000 };
            await pump(60_000);

            expect(failure).not.toBe('pending');
            expect(String(failure)).toContain('CloudFlare');
            expect(logged()).toContain(`survived ${MAX_CLEARANCE_RELOADS}/${MAX_CLEARANCE_RELOADS} reloads, giving up`);
            expect(fake.navigations).toHaveLength(MAX_CLEARANCE_RELOADS);
            expect(fake.opened).toBe(1);
        });
    }

    /**
     * The reported failure in miniature: the clearance arrives, the window is reloaded, and the
     * document which replaces it gets judged 950 ms after its load — by then both reloads and the
     * error were already spent (1.5 s after the cookie appeared). Neither decision may be taken
     * while the fresh document still renders, and the memory of the solve must survive the very
     * navigation it triggered: the poller the DOMReady rebuilds re-baselines the cookie and can no
     * longer see the change which justified that reload.
     */
    it('Should defer the judgement on a freshly loaded document, then act once it aged', async () => {
        const fake = new FakeWindow();
        const { fetch } = await startChallenge(fake);
        await issueClearance(fake, FRESH, 0);
        expect(fake.navigations).toHaveLength(0);
        await pump(90_000);
        expect(fake.navigations).toEqual([ CHALLENGE_URL ]);

        // Reload #1 replaced the interstitial with another one: young document, leave it alone.
        fake.challenge = { isChallenge: true, hasRealWidget: true, cfMarkers: '.cf-turnstile', age: 950 };
        fake.Load();
        await pump(8_000);
        expect(fake.navigations).toEqual([ CHALLENGE_URL ]);
        expect(logged()).toContain(`cf_clearance issued but the challenge document is only 950ms old, waiting ${CHALLENGE_WIDGET_RENDER_GRACE}ms before judging it`);
        expect(challengeWindowLines()).toHaveLength(0);

        // The document has aged past the render grace and is still the challenge: the window-scoped
        // memory of the solve takes the measured second reload (its own poller baselined the cookie
        // away, so only this memory can still see that the clearance was issued).
        fake.challenge.age = 20_000;
        for (let elapsed = 0; elapsed < 20_000 && fake.navigations.length < 2; elapsed += 1_000) {
            await pump(1_000);
        }
        expect(fake.navigations).toEqual([ CHALLENGE_URL, CHALLENGE_URL ]);
        expect(logged()).toContain(`reload #2/${MAX_CLEARANCE_RELOADS} of the same window`);

        // The reader page arrives at last: one extraction, one window for the whole validation.
        fake.challenge = undefined;
        fake.Load();
        await pump(3_000);
        expect(fake.pending).toHaveLength(1);
        fake.pending[0].resolve({ links: [ `${CHALLENGE_URL}#page-1` ] });
        await expect(fetch).resolves.toEqual({ links: [ `${CHALLENGE_URL}#page-1` ] });
        expect(fake.opened).toBe(1);
    });

    /**
     * A round which is awaiting the debugger when a navigation happens decides for a document it
     * never read: stopping only its pending timer let it re-arm itself. Traced end-to-end, those
     * survivors spent two reloads plus the Cloudflare error within 1.5 s of the clearance — on a
     * window the poller rebuilt by that navigation now owns.
     */
    it('Should silence a superseded round whose document was replaced while it was in flight', async () => {
        const fake = new FakeWindow();
        const { fetch } = await startChallenge(fake);
        let failure: unknown = 'pending';
        void fetch.then(() => { failure = 'resolved'; }, error => { failure = String(error); });

        // Hold the next round inside its probe: everything it will decide belongs to a document
        // which no longer exists by the time it resumes.
        let release: () => void = () => undefined;
        fake.detectionGate = new Promise<void>(resolve => { release = resolve; });
        await pump(6_000);
        // The solve lands while that round hangs, and the navigation below replaces the document
        // it was started for — DOMReady then stops the superseded poller.
        fake.clearance = FRESH;
        fake.Load();
        fake.detectionGate = undefined;
        release();
        await pump(0);

        // Without the stop flag this round re-armed itself and spent the fresh clearance: reload on
        // a document it had already read, or the failure — the reported bug.
        expect(fake.navigations).toHaveLength(0);
        expect(logged()).not.toContain('cf_clearance issued but the challenge');
        expect(failure).toBe('pending');

        // The poller rebuilt by the navigation baselined the new cookie: no change for it either —
        // the window stays open, on its own budget, without anyone racing it.
        await pump(15_000);
        expect(fake.navigations).toHaveLength(0);
        expect(logged()).not.toContain('cf_clearance issued but the challenge');
        expect(failure).toBe('pending');
        expect(challengeWindowLines()).toHaveLength(0);
    });

    /**
     * What the prebuilt CrunchyScan DRM module really asks for, decoded from its obfuscated call site
     * (`FetchWindowScript(new Request(url), script, 0x188c + -0x2022 + -0x8ad * -0x2)`): a **2.5 s**
     * delay and the platform **default 60 s** timeout — twice the 30 s the JapScan DRM passes
     * explicitly (`FetchWindowPreloadScript(..., 0, 30000)`, mirrored by its `DRM_WINDOW_BUDGET_MS`).
     * The bounded restart of a stalled clearance therefore has to complete well inside those 60 s, or
     * the connector would be back to the timeout that path exists to avoid.
     */
    for (const flavour of [
        { name: 'interactive challenge', hasRealWidget: true },
        { name: 'managed challenge (no widget, the caller budget stays armed)', hasRealWidget: false },
    ]) {
        it(`Should complete the bounded reload sequence within the CrunchyScan DRM window budget (${flavour.name})`, async () => {
            const DRM_DELAY = 2_500;
            const DRM_WINDOW_BUDGET = 60_000;
            const url = 'https://www.crunchyscan.org/lecture-en-ligne/demo/';
            let elapsed = 0;
            /** Every step below counts towards the budget the window was opened with. */
            const step = async (ms: number) => { await pump(ms); elapsed += ms; };
            const fake = new FakeWindow();
            fake.challenge = { isChallenge: true, hasRealWidget: flavour.hasRealWidget, cfMarkers: '.cf-turnstile', age: 20_000 };
            // Keep the age-driven poller on its initial render grace in this managed-challenge
            // fixture so the test isolates the clearance-driven restart path.
            if (!flavour.hasRealWidget) fake.stalledChallengeAge = 0;
            fake.clearance = PERSISTED;
            fake.currentURL = new URL(url);
            harness.window = fake;
            const provider = new TestProvider();
            provider.Initialize({ VerboseFetchWindow: { Value: false } } as unknown as FeatureFlags);
            let outcome = 'pending';
            void provider.FetchWindowPreloadScript(new Request(url), '', `${SCRIPT_MARKER} void 0;`, DRM_DELAY, DRM_WINDOW_BUDGET, false)
                .then(() => { outcome = 'resolved'; }, (error: unknown) => { outcome = String(error); });
            await step(0);
            fake.Load();
            // 2.5 s classification grace (the stalled-reload sites all pay it), then poll rounds.
            await step(3_000);

            // The first poll sees the persisted cookie; once a fresh value arrives, Cloudflare's
            // normal 30 s post-validation window expires and the same window restarts. The original
            // solve stays remembered across both navigations, so no artificial second solve is needed.
            await issueClearance(fake, FRESH, 0);
            for (let waited = 0; waited < 45_000 && fake.navigations.length === 0; waited += 1_000) {
                await step(1_000);
            }
            expect(fake.navigations, logged()).toEqual([ url ]);

            // The page after F5 is still a mature challenge. A new DOMReady takes over;
            // age-gated poll rounds may spend the second reload after their own poll cadence.
            fake.Load();
            for (let waited = 0; waited < 15_000 && fake.navigations.length < 2; waited += 1_000) {
                await step(1_000);
            }
            expect(fake.navigations, logged()).toEqual([ url, url ]);
            fake.Load();
            // The DOMReady of the last replacement runs the classification grace, then decides:
            // the reload budget is spent and the challenge is still current → explicit Cloudflare
            // error, never the silent window timeout.
            await step(6_000);

            // The explicit error, never the silent window timeout the connector answers with yet
            // another window — that is the whole point of the bounded restart.
            expect(outcome, logged()).toContain('CloudFlare');
            // Two clearance reloads plus the final render/failure fit comfortably in the 60 s DRM timeout.
            expect(elapsed).toBeLessThan(DRM_WINDOW_BUDGET);
            // Nothing was ever injected on the still-current challenge page, and one window did it all.
            expect(fake.pending).toHaveLength(0);
            expect(fake.opened).toBe(1);
        });
    }

    it('Should inject a detection script the renderer can parse and read the markers from', async () => {
        const fake = new FakeWindow();
        await startChallenge(fake);

        // The detection script is assembled from a template literal, which consumes one level of
        // escaping: a slash or dot written with a single backslash reaches the renderer as a bare
        // character, closes the marker regex early and turns the rest of the pattern into flags.
        // `tsc`, the linter and every probe test stay green on that text (only the assembled script
        // is malformed), so the failure surfaced in the app as a silent `cf=-` on every poll round
        // until the window timed out — this test evaluates what the window actually receives.
        const injected = fake.injected.filter(script => script.includes('cfMarkers'));
        expect(injected).toHaveLength(1);

        // A minimal document which is not a challenge (so the probe stays out of the way): the
        // marker test is the only thing under test here, together with the script being parseable.
        // Parenthesized: the injected text opens on its own line, so a bare `return` would be cut
        // short by automatic semicolon insertion and yield `undefined` instead of the probe result.
        const detection = new Function('document', 'window', `return (${injected[0]});`);
        const probe = (href: string) => detection({
            title: '',
            body: null,
            querySelector: () => null,
            location: { href },
        }) as { isChallenge: boolean, cfMarkers: string };

        const ordinary = probe('https://www.japscan.lol/manga/demo/12/');
        expect(ordinary.isChallenge).toBe(false);
        expect(ordinary.cfMarkers).toBe('');
        const hiddenTurnstile = new Function('document', 'window', `return (${injected[0]});`)({
            title: 'Reader',
            body: null,
            location: { href: 'https://www.japscan.lol/manga/demo/12/' },
            querySelector: (selector: string) => selector === '.cf-turnstile'
                ? { getBoundingClientRect: () => ({ width: 200, height: 50 }) }
                : null,
        }, {
            getComputedStyle: () => ({ display: 'none', visibility: 'hidden', opacity: '0' }),
        }) as { isChallenge: boolean; cfMarkers: string };
        expect(hiddenTurnstile.isChallenge).toBe(false);
        expect(hiddenTurnstile.cfMarkers).toBe('');
        // Cloudflare's own URL markers: `__cf_chl_` is the token the interstitial is served with,
        // the platform paths show up in the casing the challenge scripts use.
        expect(probe('https://www.japscan.foo/manga/-/?__cf_chl_rt_tk=abc').cfMarkers).toBe('url');
        expect(probe('https://www.japscan.foo/CDN-CGI/CHALLENGE-PLATFORM/x').cfMarkers).toBe('url');
    });

    /**
     * Opens a challenge window and lets it end unresolved: the user never validates the captcha, so
     * the interactive budget (150 s) expires and the window spends one unit of the per-origin one.
     */
    const startUnresolvedChallenge = async (): Promise<void> => {
        const fake = new FakeWindow();
        const { fetch } = await startChallenge(fake);
        const outcome = fetch.catch((error: unknown) => String(error));
        await pump(151_000);
        await outcome;
    };

    it('Should refuse a fourth successive challenge window which never got past it', async () => {
        // Three windows in a row ending on their captcha, each carrying a FRESH per-window budget
        // (2 clearance reloads, 3 stalled reloads): that is exactly the loop the caller used to
        // feed with one more window per timeout, and no budget living inside a single window can
        // end it.
        for (let window = 1; window <= MAX_CHALLENGE_WINDOWS; window++) {
            await startUnresolvedChallenge();
            expect(challengeWindowLines().at(-1)).toContain(`unresolved challenge window #${window}/${MAX_CHALLENGE_WINDOWS}`);
        }

        // The caller's next attempt is refused BEFORE its window exists: no DOMReady subscription,
        // no injected script, and the localized Cloudflare error a failed validation raises.
        const fake = new FakeWindow();
        fake.challenge = { isChallenge: true, hasRealWidget: true, cfMarkers: '.cf-turnstile', age: 20_000 };
        harness.window = fake;
        const provider = new TestProvider();
        provider.Initialize({ VerboseFetchWindow: { Value: false } } as unknown as FeatureFlags);
        await expect(provider.FetchWindowPreloadScript(new Request(CHALLENGE_URL), '', `${SCRIPT_MARKER} void 0;`, 0, 60_000, false))
            .rejects.toThrow(/CloudFlare/i);
        expect(logged()).toContain(`refusing to open another challenge window for https://www.japscan.lol`);
        expect(fake.domReady).toHaveLength(0);
        expect(fake.injected).toHaveLength(0);
    });

    it('Should clear the succession as soon as a window serves the real page', async () => {
        // Two windows ending on their challenge …
        for (let window = 1; window <= 2; window++) {
            await startUnresolvedChallenge();
        }
        expect(challengeWindowLines()).toHaveLength(2);
        expect(challengeWindowLines().at(-1)).toContain(`unresolved challenge window #2/${MAX_CHALLENGE_WINDOWS}`);

        // … then one serving the real page (the challenge was solved and the site navigated, or the
        // origin simply stopped challenging): the succession is over instead of being accumulated.
        const ordinary = new FakeWindow();
        ordinary.challenge = undefined;
        harness.window = ordinary;
        const provider = new TestProvider();
        provider.Initialize({ VerboseFetchWindow: { Value: false } } as unknown as FeatureFlags);
        const fetch = provider.FetchWindowPreloadScript<{ links: string[] }>(new Request(CHALLENGE_URL), '', `${SCRIPT_MARKER} void 0;`, 0, 60_000, false);
        await pump(0);
        ordinary.Load();
        await pump(3_000);
        ordinary.pending[0].resolve({ links: [ 'https://www.japscan.lol/img/1.jpg' ] });
        await expect(fetch).resolves.toEqual({ links: [ 'https://www.japscan.lol/img/1.jpg' ] });
        // A window which served its pages spends nothing …
        expect(challengeWindowLines()).toHaveLength(2);

        // … and the next challenged window opens a NEW succession instead of resuming the old one.
        await startUnresolvedChallenge();
        expect(challengeWindowLines()).toHaveLength(3);
        expect(challengeWindowLines().at(-1)).toContain(`unresolved challenge window #1/${MAX_CHALLENGE_WINDOWS}`);
    });

    /**
     * The same budget, exercised for the OTHER fork-handled sites. It is global and per-origin, so a
     * mistake in how a window is counted is invisible on JapScan alone: CrunchyScan, Comix, MangaFire
     * and MangaMoins open one window per page (browse list, chapter list, reader) and a normal session
     * there must never be refused.
     */
    describe('per-origin challenge window budget (fork-handled sites)', () => {

        /** The sites under guard, addressed the way their connectors address them. */
        const SITES = [
            { name: 'CrunchyScan', listing: 'https://www.crunchyscan.org/manga/demo/', chapter: 'https://www.crunchyscan.org/chapter/demo-1/' },
            { name: 'Comix', listing: 'https://comix.to/manga/demo', chapter: 'https://comix.to/manga/demo/chapter-1' },
            { name: 'MangaFire', listing: 'https://mangafire.to/manga/demo', chapter: 'https://mangafire.to/read/demo/en/chapter-1' },
            { name: 'MangaMoins', listing: 'https://www.mangamoins.com/manga/demo', chapter: 'https://www.mangamoins.com/manga/demo/1' },
        ];

        /** The interactive challenge these sites are served on their reader pages. */
        const CHALLENGE = { isChallenge: true, hasRealWidget: true, cfMarkers: '.cf-turnstile', age: 20_000 };

        /**
         * The managed flavour of the same interstitial: Cloudflare resolves it on its own, with no
         * control to click, so the window keeps its own fetch timeout (see the slow reader below).
         */
        const MANAGED_CHALLENGE = { isChallenge: true, hasRealWidget: false, cfMarkers: '.cf-turnstile', age: 20_000 };

        /** Starts the fetch flow of one window on `url` and loads its first document. */
        const openWindow = async (url: string, challenge?: typeof CHALLENGE) => {
            const fake = new FakeWindow();
            fake.challenge = challenge;
            fake.clearance = PERSISTED;
            fake.currentURL = new URL(url);
            harness.window = fake;
            const provider = new TestProvider();
            provider.Initialize({ VerboseFetchWindow: { Value: false } } as unknown as FeatureFlags);
            const fetch = provider.FetchWindowPreloadScript<{ links: string[] }>(new Request(url), '', `${SCRIPT_MARKER} void 0;`, 0, 60_000, false);
            await pump(0);
            fake.Load();
            await pump(3_000);
            return { fake, fetch };
        };

        /**
         * Simulates the challenge of the current document being solved: the site (or Cloudflare)
         * navigates to the real page, which the flow classifies as a plain document.
         */
        const getPastChallenge = async (fake: FakeWindow): Promise<void> => {
            fake.challenge = undefined;
            fake.Load();
            await pump(3_000);
        };

        /** Lets the extraction script of the loaded document run and return `links`. */
        const extract = async (fake: FakeWindow, fetch: Promise<{ links: string[] }>, links: string[]): Promise<void> => {
            expect(fake.pending).toHaveLength(1);
            fake.pending[0].resolve({ links });
            await expect(fetch).resolves.toEqual({ links });
        };

        for (const site of SITES) {
            it(`Should never refuse an ordinary ${site.name} session`, async () => {
                // The guard is only meaningful on the fork path, where the budget lives: assert the
                // site really is on it instead of trusting a registration which may have moved.
                expect(ShouldUseForkChallengeHandling(site.listing)).toBe(true);
                expect(ShouldUseForkChallengeHandling(site.chapter)).toBe(true);

                // Two chapters read back to back: browse list, chapter list and reader, i.e. six
                // windows on the same origin — twice the budget. The reader window meets an
                // interactive challenge which RESOLVES (the user validates it and the site navigates
                // to the real page): such a window served content and must spend nothing.
                for (const chapter of [ 1, 2 ]) {
                    const listing = await openWindow(site.listing);
                    await extract(listing.fake, listing.fetch, [ `${site.listing}#manga` ]);

                    const chapters = await openWindow(`${site.listing}/chapters`);
                    await extract(chapters.fake, chapters.fetch, [ `${site.chapter}` ]);

                    const reader = await openWindow(site.chapter, CHALLENGE);
                    // The challenge is solved and the site navigates to the real reader page, which
                    // the flow classifies as a plain document before running the extraction.
                    await getPastChallenge(reader.fake);
                    await extract(reader.fake, reader.fetch, [ `${site.chapter}#page-${chapter}` ]);
                }

                // A reader window which DID get past its challenge but whose extraction then failed
                // (the site's own script threw on the real page): the window served content, so it
                // must not pay for a challenge it already cleared.
                const failing = await openWindow(site.chapter, CHALLENGE);
                await getPastChallenge(failing.fake);
                expect(failing.fake.pending).toHaveLength(1);
                failing.fake.pending[0].reject(new Error('reader script failed on the real page'));
                await expect(failing.fetch).rejects.toThrow('reader script failed on the real page');

                // Same for a reader whose extraction simply never settles (slow site): the managed
                // challenge resolved on its own, the real page is current, and only the window's own
                // timeout ends it — a timeout which is NOT the trace of a challenge loop. The managed
                // flavour is the one whose fetch timeout survives the challenge handling.
                const slow = await openWindow(site.chapter, MANAGED_CHALLENGE);
                await getPastChallenge(slow.fake);
                const slowOutcome = slow.fetch.catch((error: unknown) => String(error));
                // Pumped in steps: one single jump keeps the fake clock inside a timer chain the
                // poller keeps extending, and never returns.
                for (let elapsed = 0; elapsed < 60_000; elapsed += 5_000) {
                    await pump(5_000);
                }
                expect(await slowOutcome).toBeTruthy();
                expect(logged()).toContain('closing window (fetch timeout)');

                // None of the eight windows above spent anything …
                expect(challengeWindowLines()).toHaveLength(0);
                expect(logged()).not.toContain('refusing to open another challenge window');
            });
        }

        it('Should still spend one unit when a fork-handled site never gets past its challenge', async () => {
            // The counterpart of the guard above: those sessions must stay free because they SUCCEED,
            // never because the budget stopped applying to them.
            for (const site of SITES) {
                const { fetch } = await openWindow(site.chapter, CHALLENGE);
                const outcome = fetch.catch((error: unknown) => String(error));
                // The user never validates the captcha: the interactive budget (150 s) expires.
                await pump(151_000);
                await outcome;
                expect(challengeWindowLines().at(-1)).toContain(`unresolved challenge window #1/${MAX_CHALLENGE_WINDOWS} for ${new URL(site.chapter).origin}`);
            }
        });

        it('Should refuse the fourth successive unresolved window of a fork-handled site', async () => {
            // Comix opens three windows per view (browse, chapters, pages): the loop the caller
            // creates by answering each failure with one more window is what this bounds.
            const url = SITES[1].chapter;
            for (let window = 1; window <= MAX_CHALLENGE_WINDOWS; window++) {
                const { fetch } = await openWindow(url, CHALLENGE);
                const outcome = fetch.catch((error: unknown) => String(error));
                await pump(151_000);
                await outcome;
                expect(challengeWindowLines().at(-1)).toContain(`unresolved challenge window #${window}/${MAX_CHALLENGE_WINDOWS}`);
            }

            // Refused BEFORE its window exists: no DOMReady subscription, no injected script.
            const refused = new FakeWindow();
            refused.challenge = CHALLENGE;
            harness.window = refused;
            const provider = new TestProvider();
            provider.Initialize({ VerboseFetchWindow: { Value: false } } as unknown as FeatureFlags);
            await expect(provider.FetchWindowPreloadScript(new Request(url), '', `${SCRIPT_MARKER} void 0;`, 0, 60_000, false))
                .rejects.toThrow(/CloudFlare/i);
            expect(logged()).toContain('refusing to open another challenge window for https://comix.to');
            expect(refused.domReady).toHaveLength(0);
            expect(refused.injected).toHaveLength(0);
        });
    });
});
