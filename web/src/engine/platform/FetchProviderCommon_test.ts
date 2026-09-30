import { vi, describe, expect, it, beforeEach, afterEach, type MockInstance } from 'vitest';
import { MIN_CLEARANCE_LENGTH, NextClearanceState, NormalizeClearance, FetchProvider } from './FetchProviderCommon';
import { AddForkChallengeHandling } from './ChallengeReload';
import type * as AntiScrapingDetectionModule from './AntiScrapingDetection';
import type { FeatureFlags } from '../FeatureFlags';

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
});

/** Window double: lets the test drive document loads and script injections by hand. */
class FakeWindow {

    public opened = 0;
    public readonly domReady: (() => Promise<void>)[] = [];
    public readonly beforeNavigate: ((uri: URL) => Promise<null>)[] = [];
    public readonly injected: string[] = [];
    public readonly pending: { resolve: (value: unknown) => void, reject: (error: Error) => void }[] = [];

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

    public async Open(): Promise<void> {
        this.opened++;
    }

    public async Show(): Promise<void> {
        return undefined;
    }

    public async Close(): Promise<void> {
        return undefined;
    }

    public async SendDebugCommand<T>(): Promise<T> {
        return { cookies: [] } as unknown as T;
    }

    public ExecuteScript<T>(script: string): Promise<T> {
        this.injected.push(script);
        if (script.includes(SCRIPT_MARKER)) {
            // The script under test hangs until the test settles it by hand.
            return new Promise<T>((resolve, reject) => this.pending.push({ resolve: value => resolve(value as T), reject }));
        }
        // Challenge detection probes report "no challenge".
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

    public async Fetch(): Promise<Response> {
        throw new Error('not needed in this test');
    }
}

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
