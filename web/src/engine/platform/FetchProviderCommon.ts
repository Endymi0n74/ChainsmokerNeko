import protobuf from 'protobufjs';
import { Exception, InternalError } from '../Error';
import { EngineResourceKey as R } from '../../i18n/ILocale';
import { CreateRemoteBrowserWindow } from './RemoteBrowserWindow';
import { CheckAntiScrapingDetection, FetchRedirection } from './AntiScrapingDetection';
import { ShouldReloadStalledChallenge, ShouldUseForkChallengeHandling } from './ChallengeReload';
import type { FeatureFlags } from '../FeatureFlags';
import { Delay, SetTimeout, ClearTimeout } from '../BackgroundTimers';

/**
 * Exponential backoff helper for challenge polling: `base * 2^attempt`, capped.
 */
function BackoffDelay(attempt: number, base = 2000, cap = 10_000): number {
    return Math.min(base * 2 ** attempt, cap);
}

/** Cloudflare's real `cf_clearance` is always longer than this; shorter = absent/truncated. */
export const MIN_CLEARANCE_LENGTH = 201;

/**
 * Normalizes a raw `cf_clearance` read into a comparable value: a clearance shorter than
 * {@link MIN_CLEARANCE_LENGTH} is not a real one and must be treated as "no cookie".
 */
export function NormalizeClearance(value: string | undefined): string {
    return value && value.length >= MIN_CLEARANCE_LENGTH ? value : '';
}

/**
 * Advances the `cf_clearance` baseline of a single window/document.
 *
 * A clearance already present when the challenge started can never prove it was solved: the
 * challenged request already carried it, so its mere presence is not a resolution signal (the
 * same root cause as the CrunchyScan reload bug fixed on 2026-09-27, where `lastClearance = ''`
 * made the very first CDP read look like a "change" and closed the window mid-validation).
 *
 * @param previous - The baseline, or `undefined` when no read succeeded yet.
 * @param raw - The raw cookie value just read (`undefined` when the read itself failed).
 * @returns The baseline to keep and whether a genuinely NEW clearance was observed.
 */
export function NextClearanceState(previous: string | undefined, raw: string | undefined): { baseline: string | undefined; changed: boolean } {
    if (raw === undefined) return { baseline: previous, changed: false };
    const value = NormalizeClearance(raw);
    if (previous === undefined) return { baseline: value, changed: false };
    if (value && value !== previous) return { baseline: value, changed: true };
    return { baseline: previous, changed: false };
}

/**
 * Selectors covering the real interactive widgets across Cloudflare Turnstile
 * variants, reCAPTCHA and hCaptcha (the iframe/checkbox is the interactive
 * widget; hidden response inputs are always present and must NOT match).
 */
const ChallengeWidgetSelectors = [
    // Turnstile (various site-key/wrapper layouts)
    '.cf-turnstile iframe',
    'iframe[src*="challenges.cloudflare.com/turnstile"]',
    'iframe[src*="challenges.cloudflare.com"]',
    '#challenge-stage iframe',
    '#challenge-stage input[type="checkbox"]',
    '.challenge-form [type="checkbox"]',
    '#turnstile-wrapper iframe',
    '[data-turnstile-sitekey] iframe',
    'div[class*="turnstile"] iframe',
    'input[type="checkbox"][name="turnstile"]',
    // reCAPTCHA v2
    '.g-recaptcha iframe',
    'iframe[src*="recaptcha"]',
    '#recaptcha iframe',
    '[data-sitekey] iframe',
    // hCaptcha
    '.h-captcha iframe',
    'iframe[src*="hcaptcha"]',
].join(', ');

/**
 * DOM/body markers that identify a Cloudflare challenge interstitial page.
 */
const ChallengePageSelectors = [
    '.cf-turnstile',
    '#challenge-stage',
    '.challenge-form',
    '#turnstile-wrapper',
    '[data-turnstile-sitekey]',
    '.g-recaptcha',
    '#recaptcha',
    '.h-captcha',
    '[name="cf-turnstile-response"]',
].join(', ');

export abstract class FetchProvider {

    private featureFlags: FeatureFlags;

    protected async ValidateResponse(response: Response): Promise<void> {
        if (/challenge/i.test(response.headers.get('CF-Mitigated'))) {
            throw new Exception(R.FetchProvider_Fetch_CloudFlareChallenge, response.url);
        }
        if (/challenge/i.test(response.headers.get('X-Vercel-Mitigated'))) {
            throw new Exception(R.FetchProvider_Fetch_VercelChallenge, response.url);
        }
        if (response.status === 403) {
            throw new Exception(R.FetchProvider_Fetch_Forbidden, response.url);
        }
    }

    /**
     * ...
     */
    public Initialize(featureFlags: FeatureFlags): void {
        this.featureFlags = featureFlags;
    }

    /**
     * ...
     * @param request - ...
     */
    public abstract Fetch(request: Request): Promise<Response>;

    /**
     * Fetch and parse the remote HTML content into a virtual {@link Document} for further processing.
     * @param request - The request used to fetch the remote content.
     * @returns A virtual DOM with limited capabilities:
     *    - Since the document is detached it will not be rendered, therefore certain behavior may not be as expected (e.g., innerText is the same as textContent)
     *    - The document uses the base URL of the application instead of `request.url`, which affects all expanded links in the document
     */
    public async FetchHTML(request: Request): Promise<Document> {
        const mime = 'text/html';
        const charsetPattern = /charset=([\w-]+)/;

        const response = await this.Fetch(request);
        const data = await response.arrayBuffer();
        let document = new DOMParser().parseFromString(new TextDecoder().decode(data), mime);

        const charset = document.head?.querySelector<HTMLMetaElement>('meta[charset]')?.getAttribute('charset')
            || document.head?.querySelector<HTMLMetaElement>('meta[http-equiv="Content-Type"]')?.content?.match(charsetPattern)?.at(1)
            || response.headers?.get('Content-Type')?.match(charsetPattern)?.at(1)
            || 'UTF-8';

        document = /UTF-?8/i.test(charset) ? document : new DOMParser().parseFromString(new TextDecoder(charset).decode(data), mime);

        // NOTE: Monkey patching the `innerText` property, stripping whitespaces as it would be rendered when attached to window DOM
        const selectors = [ 'h1', 'h2', 'h3', 'h4', 'h5', 'div', 'span', 'a', 'li' ].join(', ');
        for (const element of document.body.querySelectorAll<HTMLElement>(selectors)) {
            Object.defineProperty(element, 'innerText', {
                get: () => element.textContent?.replace(/\s+/g, ' ').trim()
            });
        }

        return document;
    }

    /**
     * ...
     * @param request - ...
     */
    public async FetchJSON<T extends JSONElement>(request: Request): Promise<T> {
        const response = await this.Fetch(request);
        return response.json();
    }

    /**
     * ...
     * @param request - ...
     * @param query - ...
     */
    public async FetchCSS<T extends HTMLElement>(request: Request, query: string): Promise<T[]> {
        const dom = await this.FetchHTML(request);
        return [ ...dom.querySelectorAll(query) ] as T[];
    }

    /**
     * Perform a GraphQL request (POST) to a desired endpoint and returns JSON data.
     * @param operationName - The name of the query to be performed or `undefined` for unnamed queries
     * @param query - A valid GraphQL query
     * @param variables - A JSONObject containing the variables of the query.
     * @param extensions - ...
     */
    public async FetchGraphQL<T extends JSONElement>(request: Request, operationName: string, query: string | undefined, variables: JSONObject, extensions: JSONObject | undefined = undefined): Promise<T> {

        const graphQLRequest = new Request(request.url, {
            method: 'POST',
            body: JSON.stringify({ operationName, query, variables, extensions }),
            headers: {
                'Content-Type': 'application/json',
                'Accept': '*/*'
            },
        });

        // NOTE: Copy custom headers from parent request
        for (const header of request.headers) {
            graphQLRequest.headers.set(header.at(0), header.at(1));
        }

        type GraphQLResult = {
            errors: {
                code: number;
                message: string;
            }[];
            data: T;
        };

        const data = await this.FetchJSON<GraphQLResult>(graphQLRequest);
        if (data.errors && data.errors.length > 0) {
            throw new Exception(R.FetchProvider_FetchGraphQL_AggregateError, data.errors.map(error => error.message).join('\n'));
        }
        if (!data.data) {
            throw new Exception(R.FetchProvider_FetchGraphQL_MissingDataError);
        }
        return data.data;
    }

    /**
     * ...
     * @param request - ...
     * @param regex - ...
     */
    public async FetchRegex(request: Request, regex: RegExp): Promise<string[]> {
        if (regex.flags.indexOf('g') === -1) {
            throw new InternalError(`The provided RegExp must contain the global 'g' modifier!`);
        }
        const response = await fetch(request);
        const data = await response.text();
        const result: string[] = [];
        let match = undefined;
        while (match = regex.exec(data)) {
            result.push(match.at(1));
        }
        return result;
    }

    /**
     * Fetch and decode a protocol buffer message.
     * @param schema - The schema of the protocol buffer including all supported message definitions
     * @param messageTypePath - The name of the package and schema type separated by a `.` which should be used to decode the response
     * @returns The decoded response data
     */
    public async FetchProto<T extends JSONElement>(request: Request, schema: string, messageTypePath: string): Promise<T> {
        const response = await fetch(request);
        const serialized = new Uint8Array(await response.arrayBuffer());
        const prototype = protobuf.parse(schema, { keepCase: true }).root.lookupType(messageTypePath);
        return prototype.decode(serialized).toJSON() as T;
    }

    /*
    public async FetchXPATH(request: Request, xpath: string): Promise<Node[]> {
        const dom = await this.FetchHTML(request);
        const result = document.evaluate(xpath, dom, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        return new Array(result.snapshotLength).fill(null).map((_, index) => result.snapshotItem(index) as Node);
    }
    */

    /**
     * Scans the members of the given {@link payload} recursively, searching for the first occurence that fulfills the given {@link predicate}
     * and returns the corresponding value, or `undefined` if non was found.
     */
    #ExtractValueNextJS<T extends JSONElement>(payload: JSONElement, predicate: (data: JSONObject<JSONElement> | JSONArray<JSONElement>) => unknown): T {
        if (payload && typeof payload === 'object') {
            if (predicate(payload)) return payload as T;
            for (const value of Object.values(payload)) {
                const result = this.#ExtractValueNextJS<T>(value, predicate);
                if (result) return result;
            }
        }
        return undefined;
    }

    /**
     * Extract all NextJS hydrated flight data payloads from the HTML script tags of the provided {@link request}
     * and returns the first nested data element that fulfills the given {@link predicate} or `undefined` if non was found.
     * @remarks This is an extremely flakey extractor for NextJS flight data which needs much improvement for generic use.
     */
    public async FetchNextJS<T extends JSONElement>(request: Request, predicate: (data: JSONObject<JSONElement> | JSONArray<JSONElement>) => unknown): Promise<T | undefined> {
        const scripts = await this.FetchCSS<HTMLScriptElement>(request, 'script:not([src])');
        const payloads = scripts
            .map(script => script.text)
            .filter(script => script.includes('self.__next_f.push'))
            .map(script => {
                // TODO: Improve extraction robustness and variety (e.g., split line breaks into sub-scripts)
                try {
                    const content: string = JSON.parse(script.slice(script.indexOf(',"') + 1, -2));
                    return JSON.parse(content.slice(content.indexOf(':') + 1)) as JSONElement;
                } catch {
                    return {} as JSONElement;
                }
            });

        for (const payload of payloads) {
            const data: T = this.#ExtractValueNextJS<T>(payload, predicate);
            if (data) return data;
        }

        return undefined;
    }

    /**
     * Reads the (httpOnly) `cf_clearance` cookie for the given {@link url} through the CDP debugger,
     * since the cookie is never visible to `document.cookie`.
     * @returns The cookie value, an empty string when the cookie is absent, or `undefined` when the
     * debugger could not answer (not ready yet, window navigating or already destroyed). A short
     * timeout guards the caller: this runs on the critical DOMReady path, where a hanging debugger
     * command would stall the whole challenge classification.
     */
    private async ReadClearance(win: ReturnType<typeof CreateRemoteBrowserWindow>, url: string, timeout = 5_000): Promise<string | undefined> {
        try {
            const cookies = await Promise.race([
                win.SendDebugCommand<{ cookies: { name: string; value: string }[] }>('Network.getCookies', { urls: [ url ] }),
                new Promise<never>((_, reject) => setTimeout(() => reject(new Error('CDP getCookies timeout')), timeout)),
            ]);
            return cookies?.cookies?.find(cookie => cookie.name === 'cf_clearance')?.value ?? '';
        } catch {
            return undefined;
        }
    }

    /**
     * Polls a Cloudflare challenge page and reloads it when the challenge is "managed" (no real widget rendered)
     * and a cf_clearance cookie is already present. This works around stalls where the page stays on
     * "Just a moment..." indefinitely because the invisible challenge never auto-resolves.
     * @param baseline - The clearance that was already present when the current document became ready;
     * only a value differing from it (a clearance issued by this document) triggers a reload.
     */
    private async ReloadStalledCloudFlareChallenge(
        win: ReturnType<typeof CreateRemoteBrowserWindow>,
        url: string,
        budget: { remaining: number; lastReloadedClearance: string; reloadInFlight: boolean },
        invocations: { name: string; info: string }[],
        baseline?: string
    ): Promise<() => void> {
        const maxReloads = 3;
        const interval = 5000;
        let stopped = false;
        let clearanceBaseline = baseline;
        let reloadCount = 0;

        const checkScript = `
            (() => {
                const hasRealWidget = !!document.querySelector('${ChallengeWidgetSelectors}');
                const title = (document.title || '').toLowerCase();
                const bodyText = (document.body?.innerText || '').toLowerCase();
                const isChallenge = title.includes('just a moment')
                    || title.includes('un instant')
                    || bodyText.includes('checking your browser')
                    || bodyText.includes('verify you are human')
                    || bodyText.includes('attention required')
                    || !!document.querySelector('${ChallengePageSelectors}');
                return {
                    isChallenge,
                    hasRealWidget
                };
            })()
        `;

        const doCheck = async () => {
            if (stopped || budget.remaining <= 0 || budget.reloadInFlight) return;
            try {
                const result = await win.ExecuteScript<{
                    isChallenge: boolean;
                    hasRealWidget: boolean;
                }>(checkScript);

                if (result?.isChallenge && !result?.hasRealWidget) {
                    // NOTE: `cf_clearance` is httpOnly, so `document.cookie` can never see it.
                    // Read the cookie through the debugger (CDP) instead — same session, httpOnly visible.
                    const clearance = await this.ReadClearance(win, url);
                    if (clearance === undefined) {
                        // Debugger not ready (navigation just happened): retry on the next cycle
                        // instead of falling back to a baseline-less (and thus harmful) reload.
                        return;
                    }
                    if (clearanceBaseline === undefined) {
                        // First successful read establishes the baseline for this document.
                        clearanceBaseline = clearance;
                        return;
                    }
                    // Reload ONLY when this document issued a NEW clearance: a stale or IP-bound
                    // cookie keeps the page on the challenge forever, but reloading it only resets
                    // the in-progress Turnstile — that is the visible loop reported on CrunchyScan.
                    if (budget.remaining > 0 && clearance && clearance !== clearanceBaseline && clearance !== budget.lastReloadedClearance) {
                        budget.remaining--;
                        budget.lastReloadedClearance = clearance;
                        budget.reloadInFlight = true;
                        reloadCount++;
                        invocations.push({
                            name: 'ReloadStalledCloudFlareChallenge',
                            info: `Reload #${reloadCount}/${maxReloads} (managed challenge, no widget, fresh cf_clearance=${clearance.length})`
                        });
                        try {
                            await win.ExecuteScript('window.location.reload()');
                        } finally {
                            budget.reloadInFlight = false;
                        }
                    }
                }
            } catch {
                // Ignore errors from ExecuteScript on a navigating/closed window
            }
        };

        let timeoutId: number;
        let scheduleAttempt = 0;
        const schedule = async () => {
            await doCheck();
            if (!stopped && budget.remaining > 0) {
                // Back off exponentially (5s → 10s → 20s → … capped at 1 min) instead of
                // hammering the window on a fixed 5s interval, so a slow managed challenge
                // is given time to resolve without spinning the CPU.
                timeoutId = await SetTimeout(schedule, BackoffDelay(scheduleAttempt++, interval, 60_000));
            }
        };
        timeoutId = await SetTimeout(schedule, interval);

        return () => {
            stopped = true;
            if (timeoutId) ClearTimeout(timeoutId);
        };
    }

    /**
     * Polls a window that was shown for an Interactive challenge until the challenge clears,
     * then runs the extraction script on the now-usable page. Used when the challenge resolves
     * in place (no navigation) — e.g. JapScan's own `#jc-overlay` puzzle — so `DOMReady` never
     * fires again and the script would otherwise never run.
     */
    private async PollForChallengeResolution(
        win: ReturnType<typeof CreateRemoteBrowserWindow>,
        url: string,
        cloudflareDetectionScript: string,
        runScript: () => Promise<void>,
        isSettled: () => boolean,
        stopPollers: (() => void)[],
        invocations: { name: string; info: string }[],
        baseline?: string
    ): Promise<void> {
        let pollerId: number;
        const stop = () => {
            if (pollerId) ClearTimeout(pollerId);
        };
        stopPollers.push(stop);

        let pollAttempts = 0;
        // `cf_clearance` already present when this challenge started (a persisted,
        // re-injected cookie — see CLOUDFLARE.md §6). Such a value can never prove the
        // challenge was solved: the challenged request already carried it, so its mere
        // presence is not a resolution signal. `undefined` means "baseline not read yet";
        // only a clearance issued from here on (a genuine change) may clear the poller.
        // Without this baseline the first CDP read always looked like a "change" and
        // `runScript()` fired while the user was still solving the challenge, closing
        // the window mid-validation (the CrunchyScan reload bug, same root cause).
        // The caller passes the value read at DOMReady (same source as
        // `ReloadStalledCloudFlareChallenge`): `''` means "read fine, no cookie yet" — a
        // clearance appearing later is then a genuine change. `undefined` (the read failed)
        // leaves the baseline unset so the first successful read below establishes it.
        let lastClearance: string | undefined = typeof baseline === 'string' ? NormalizeClearance(baseline) : undefined;
        const MAX_POLL_ATTEMPTS = 40;
        const poll = async () => {
            if (isSettled()) return;
            if (++pollAttempts > MAX_POLL_ATTEMPTS) {
                console.warn("[KUMO] PollForChallengeResolution: max attempts reached for", url);
                return;
            }
            let cleared = false;
            // Which of the two conditions below is holding the round back, logged every
            // round. This loop is the only gate between "the user solved the challenge"
            // and the extraction script starting, and it used to be completely silent:
            // a poller that never concluded left Media.Update() hanging until the 300 s
            // task timeout with nothing in the log to explain why (Volume 22, 28 sept.).
            let cfIsChallenge = '-', cfWidget = '-', siteState = '-', clearanceNote = '-';
            try {
                const cloudflare = await win.ExecuteScript<{ isChallenge: boolean; hasRealWidget: boolean }>(cloudflareDetectionScript);
                cfIsChallenge = String(cloudflare?.isChallenge);
                cfWidget = String(cloudflare?.hasRealWidget);
                // A Turnstile widget disappearing from the DOM means the challenge was solved,
                // even if residual challenge text remains in the body (e.g. MangaFire).
                // Do not treat a challenge with no detectable widget as solved immediately:
                // CrunchyScan renders Turnstile in a child frame, while JapScan may render its
                // own overlay asynchronously. The cookie check below is the authoritative signal.
                const widgetGone = cloudflare?.isChallenge && !cloudflare?.hasRealWidget && !/crunchyscan\.org|japscan\./i.test(url);
                // Always run site-specific detection (JapScan overlay, CrunchyScan subframe, etc.)
                const antiScraping = await CheckAntiScrapingDetection(win, url);
                siteState = String(FetchRedirection[antiScraping]);
                // Turnstile widget gone = CF solved. Site detection resolved = site own challenge solved.
                cleared = widgetGone || cloudflare?.isChallenge !== true && antiScraping === FetchRedirection.None;
                // Subframe / interactive Turnstile: DOM parent may never see the widget cleared.
                // Detect resolution via cf_clearance cookie change through CDP, with a short
                // timeout so we never block the loading screen if the debugger is not ready.
                if (!cleared) {
                    // Retry the CDP cookie read with backoff: the debugger is often not
                    // ready right after the window opens, and a transient failure must not
                    // cost the whole poll cycle.
                    for (let attempt = 0; attempt < 3 && !cleared; attempt++) {
                        // `undefined` = the read itself failed (retry); '' = read fine, no cookie.
                        const current = await this.ReadClearance(win, url, 5_000);
                        if (current === undefined) {
                            clearanceNote = 'read-failed';
                            if (attempt < 2) await Delay(BackoffDelay(attempt, 500, 2_000));
                            continue;
                        }
                        const firstRead = lastClearance === undefined;
                        const next = NextClearanceState(lastClearance, current);
                        lastClearance = next.baseline;
                        if (firstRead) {
                            // Whatever was already there proves nothing (see `lastClearance`).
                            invocations.push({ name: 'CfClearanceBaseline', info: `baseline established (present=${next.baseline.length > 0})` });
                            clearanceNote = `baseline:${next.baseline.length}`;
                            break; // Nothing can be "changed" until a later read.
                        }
                        if (next.changed) {
                            cleared = true;
                            clearanceNote = 'changed';
                            invocations.push({ name: 'CfClearanceDetected', info: `cf_clearance cookie changed via CDP, challenge resolved` });
                            break;
                        }
                        // Unchanged: keep waiting for a genuine new clearance.
                        clearanceNote = `unchanged:${current.length}`;
                        if (attempt < 2) await Delay(BackoffDelay(attempt, 500, 2_000));
                    }
                } else {
                    clearanceNote = 'skipped';
                }
            } catch (error) {
                clearanceNote = `error:${error?.message ?? error}`;
                if (error?.message?.includes("Failed to find window") || pollAttempts > 5) {
                    console.warn("[KUMO] PollForChallengeResolution: stopping poller for", url, error?.message);
                    return;
                }
            } finally {
                // `cf`/`widget` = Cloudflare's own detection, `site` = the connector's
                // (None/Automatic/Interactive), `clr` = why the cookie check did or did
                // not settle it, `cleared` = whether the extraction script was started.
                console.warn(`[KUMO] poll#${pollAttempts} cf=${cfIsChallenge} widget=${cfWidget} site=${siteState} clr=${clearanceNote} cleared=${cleared}`);
            }
            if (cleared) {
                invocations.push({ name: "ChallengeResolved", info: "Interactive challenge cleared, running extraction script" });
                try {
                    await runScript();
                } catch (error) {
                    console.warn('[KUMO] challenge resolution script failed:', error);
                }
                return;
            }
            if (isSettled()) return;
            pollerId = await SetTimeout(poll, BackoffDelay(pollAttempts, 2000, 10_000));
        };
        pollerId = await SetTimeout(poll, 4000);
    }

    private async FetchWindowPreloadScriptUpstream<T extends void | JSONElement>(request: Request, preload: string, script: string, delay = 0, timeout = 60_000): Promise<T> {
        const invocations: {
            name: string;
            info: string;
        }[] = [];

        const win = CreateRemoteBrowserWindow();
        let destroyed = false;

        const destroy = async () => {
            if (destroyed) return;
            destroyed = true;
            try {
                if (this.featureFlags.VerboseFetchWindow.Value) {
                    console.log('FetchWindow()::invocations', invocations);
                } else {
                    await win.Close();
                }
            } catch (error) {
                console.warn(error);
            }
        };

        return new Promise<T>(async (resolve, reject) => {
            let cancellation = await SetTimeout(async () => {
                await destroy();
                reject(new Exception(R.FetchProvider_FetchWindow_TimeoutError));
            }, timeout);

            win.DOMReady.Subscribe(async () => {
                invocations.push({ name: 'DOMReady', info: `Window: ${win}` });
                try {
                    const redirect = await CheckAntiScrapingDetection(win, request.url);
                    invocations.push({ name: 'performRedirectionOrFinalize()', info: `Mode: ${FetchRedirection[ redirect ]}` });
                    switch (redirect) {
                        case FetchRedirection.Interactive:
                            ClearTimeout(cancellation);
                            cancellation = await SetTimeout(() => {
                                destroy();
                                reject(new Exception(R.FetchProvider_FetchWindow_TimeoutError));
                            }, 150_000);
                            await win.Show();
                            break;
                        case FetchRedirection.Automatic:
                            break;
                        default:
                            ClearTimeout(cancellation);
                            await Delay(delay);
                            const result = await win.ExecuteScript<T>(script);
                            await destroy();
                            resolve(result);
                    }
                } catch {
                    await destroy();
                }
            });

            invocations.push({ name: 'Open', info: `Request URL: ${request.url}` });
            try {
                await win.Open(request, this.featureFlags.VerboseFetchWindow.Value, preload);
            } catch (error) {
                await destroy();
                ClearTimeout(cancellation);
                reject(error);
            }
        });
    }

    /**
     * Open the given {@link request} in a new browser window and inject the given {@link script}.
     * @param request - ...
     * @param script - The JavaScript or function that will be evaluated within the browser window
     * @param delay - The time [ms] to wait after the window was fully loaded and before the {@link script} will be injected
     * @param timeout - The maximum time [ms] to wait for the result before a timeout error is thrown (excluding the {@link delay})
     */
    public async FetchWindowScript<T extends void | JSONElement>(request: Request, script: string, delay?: number, timeout?: number, show = false): Promise<T> {
        return this.FetchWindowPreloadScript<T>(request, ``, script, delay, timeout, show);
    }

    /**
     * Open the given {@link request} in a new browser window and inject the given {@link script}.
     * @param request - ...
     * @param preload - The JavaScript or function that will be evaluated within the browser window before page is loaded
     * @param script - The JavaScript or function that will be evaluated within the browser window
     * @param delay - The time [ms] to wait after the window was fully loaded and before the {@link script} will be injected
     * @param timeout - The maximum time [ms] to wait for the result before a timeout error is thrown (excluding the {@link delay})
     */
    public async FetchWindowPreloadScript<T extends void | JSONElement>(request: Request, preload: string, script: string, delay = 0, timeout = 60_000, show = false): Promise<T> {
        if (!ShouldUseForkChallengeHandling(request.url)) {
            return this.FetchWindowPreloadScriptUpstream(request, preload, script, delay, timeout);
        }

        const invocations: {
            name: string;
            info: string;
        }[] = [];

        const win = CreateRemoteBrowserWindow();
        let destroyed = false;
        /** Injection attempts of the script: only the latest one may settle the request. */
        let scriptAttempts = 0;
        /** `true` while an attempt is waiting inside `ExecuteScript`. */
        let scriptInFlight = false;
        /** Set when a main-frame navigation tore down the document an attempt was running in. */
        let redispatchOnNextDomReady = false;

        win.BeforeWindowNavigate.Subscribe(async uri => {
            invocations.push({ name: 'BeforeNavigate', info: `URL: ${uri.href}` });
            if (scriptInFlight) {
                // A navigation destroys the execution context the script is running in: its
                // `ExecuteScript` then never settles and the caller hangs until its budget
                // expires (observed on JapScan, where the site navigates a few seconds after
                // the clearance is issued — right in the middle of the page extraction).
                // Remember it so the next DOMReady can dispatch the script again on the
                // document which replaces this one.
                redispatchOnNextDomReady = true;
                console.warn(`[KUMO] runScript: main frame navigated to ${uri.href} while attempt=${scriptAttempts} was pending`);
            }
            return null;
        });

        const stopPollers: (() => void)[] = [];
        // CrunchyScan's managed challenge can issue a fresh but unusable clearance on
        // every reload. Allow one automatic retry only, then leave the window stable for
        // a manual intervention instead of showing a visible challenge loop.
        const reloadBudget = {
            remaining: /crunchyscan\.org/i.test(request.url) ? 1 : 3,
            lastReloadedClearance: '',
            reloadInFlight: false,
        };
        // `cf_clearance` value that was already present when the current document became
        // ready (re-baselined on every navigation in the DOMReady handler below).
        // Reloading with an UNCHANGED cookie can never unblock anything — the request that
        // produced the challenge already carried it, so Cloudflare just re-serves the same
        // page — but the reload RESETS an in-progress Turnstile, which is exactly the
        // visible "flash loop" reported on CrunchyScan (and it silently voids a validation
        // the user is about to complete by hand). Only a clearance issued by the CURRENT
        // document (the real "solved but never redirected" stall) may trigger a reload.
        let clearanceBaseline: string | undefined;

        const destroy = async () => {
            if (destroyed) return;
            destroyed = true;
            try {
                for (const stop of stopPollers) {
                    stop();
                }
                stopPollers.length = 0;
                if (this.featureFlags.VerboseFetchWindow.Value) {
                    console.log('FetchWindow()::invocations', invocations);
                } else {
                    await win.Close().catch(() => {});
                }
            } catch (error) {
                console.warn(error);
            }
        };

        return new Promise<T>(async (resolve, reject) => {
            let settled = false;

            let cancellation = await SetTimeout(async () => {
                settled = true;
                await destroy();
                reject(new Exception(R.FetchProvider_FetchWindow_TimeoutError));
            }, timeout);

            const runScript = async () => {
                if (settled) return;
                settled = true;
                const attempt = ++scriptAttempts;
                scriptInFlight = true;
                const startedAt = Date.now();
                // Announce the injection: when a reader timeout leaves no `[JapScan]` line behind,
                // this tells whether the extraction script was ever executed or never reached.
                console.warn(`[KUMO] runScript: executing attempt=${attempt} for`, request?.url);
                try {
                    // Some readers (e.g. JapScan) only paint their pages once the window is
                    // actually visible (IntersectionObserver/lazy loaders pause in a hidden
                    // window). Show the window before running the extraction script.
                    if (show) {
                        await win.Show();
                        await Delay(1500);
                    }
                    await Delay(delay);
                    console.warn(`[KUMO] runScript: inject attempt=${attempt} after ${Date.now() - startedAt}ms for`, request?.url);
                    const result = await win.ExecuteScript<T>(script);
                    if (attempt !== scriptAttempts) {
                        // A newer attempt took over after a navigation: this result belongs to a
                        // document which no longer exists and must not settle the request.
                        console.warn(`[KUMO] runScript: attempt=${attempt} superseded, discarding its result for`, request?.url);
                        return;
                    }
                    scriptInFlight = false;
                    console.warn(`[KUMO] runScript: returned attempt=${attempt} after ${Date.now() - startedAt}ms for`, request?.url);
                    ClearTimeout(cancellation);
                    await destroy();
                    resolve(result);
                } catch (error) {
                    if (attempt !== scriptAttempts) {
                        console.warn(`[KUMO] runScript: attempt=${attempt} superseded, discarding its failure for`, request?.url);
                        return;
                    }
                    scriptInFlight = false;
                    if (redispatchOnNextDomReady) {
                        // The navigation killed the script's context mid-flight (Electron settles
                        // the pending `ExecuteScript` either never or with a frame-disposed error).
                        // Keep the request pending: the next DOMReady re-dispatches the script on
                        // the document which replaces this one, instead of failing a chapter whose
                        // new document is already loading.
                        console.warn(`[KUMO] runScript: attempt=${attempt} interrupted by navigation, waiting for the new document for`, request?.url, error?.message || error);
                        return;
                    }
                    ClearTimeout(cancellation);
                    await destroy();
                    if (error?.message?.includes("Failed to find window")) {
                        console.warn("[KUMO] runScript: window already destroyed, resolving empty for", request?.url);
                        resolve(undefined as T);
                    } else {
                        console.warn("[KUMO] runScript error:", request?.url, error?.message || error);
                        reject(error);
                    }
                }
            };

            win.DOMReady.Subscribe(async () => {
                invocations.push({ name: 'DOMReady', info: `Window: ${win}` });
                // A navigation creates a new DOMReady while the previous challenge poller may
                // still be waiting. Keep only the poller for the current document; otherwise
                // several reload timers race and make CrunchyScan appear to loop forever.
                for (const stop of stopPollers) {
                    stop();
                }
                stopPollers.length = 0;

                // The document was replaced while an injection was pending (flagged by the
                // `BeforeWindowNavigate` subscription above): the old attempt runs in a context
                // which no longer exists and its `ExecuteScript` may hang forever. Unlock the
                // flow below — challenge detection, grace re-check, `runScript` — so the script
                // is dispatched again on the document which has just loaded, instead of waiting
                // for a result that can never arrive.
                if (redispatchOnNextDomReady) {
                    redispatchOnNextDomReady = false;
                    scriptInFlight = false;
                    settled = false;
                    invocations.push({ name: 'ScriptRecovery', info: `Document replaced while attempt=${scriptAttempts} was pending, re-dispatching` });
                    console.warn(`[KUMO] runScript: document replaced while attempt=${scriptAttempts} was pending, re-dispatching for`, request?.url);
                }

                // Re-baseline the clearance for the document that just loaded (before any
                // challenge detection delay), so only a clearance issued from here on can
                // authorize a reload — see `clearanceBaseline`.
                clearanceBaseline = await this.ReadClearance(win, request.url);

                let redirect: FetchRedirection;

                // Only wait for managed-challenge auto-resolution on sites that opt into stalled-challenge
                // reload. Other sites do not pay this latency penalty.
                if (ShouldReloadStalledChallenge(request.url)) {
                    await Delay(2500);
                }

                // The challenge may auto-resolve (and thus navigate) right around the grace delay, which
                // tears down the execution context and makes `ExecuteScript` fail. Poll the read-only
                // Cloudflare check until the page settles instead of giving up on the first navigation race.
                const cloudflareDetectionScript = `
                    (() => {
                        const title = (document.title || '').toLowerCase();
                        const body = (document.body?.innerText || '').toLowerCase();
                        const isChallenge = title.includes('just a moment')
                            || title.includes('un instant')
                            || body.includes('checking your browser')
                            || body.includes('verify you are human')
                            || body.includes('attention required')
                            || body.includes('cf-chl-')
                            || !!document.querySelector('${ChallengePageSelectors}');
                        const hasRealWidget = !!document.querySelector('${ChallengeWidgetSelectors}');
                        return { isChallenge, hasRealWidget };
                    })()
                `;

                let cloudflare: { isChallenge: boolean; hasRealWidget: boolean } | undefined;
                // The grace delay above protects Cloudflare's proof phase. Do not keep
                // probing for 20 seconds after it: CrunchyScan needs its visible window
                // before the caller's listing timeout expires. Retry transient navigation
                // races with exponential backoff instead of a fixed delay.
                for (let attempt = 0; attempt < 4 && cloudflare === undefined; attempt++) {
                    try {
                        cloudflare = await win.ExecuteScript<{ isChallenge: boolean; hasRealWidget: boolean }>(cloudflareDetectionScript);
                    } catch {
                        if (attempt < 3) await Delay(BackoffDelay(attempt, 500, 2_000));
                    }
                }

                // Site-specific anti-scraping detections are authoritative: they know the challenge
                // mechanics of their own site (e.g. CrunchyScan's Turnstile lives in a subframe and
                // never shows a widget in the parent DOM, JapScan's #jc-overlay puzzle, MangaLink's
                // reCAPTCHA form). Run them BEFORE the generic DOM heuristic, otherwise a subframe
                // challenge would be misclassified as Automatic and the interactive window (which is
                // what actually issues the session cookie) would never open.
                try {
                    redirect = await CheckAntiScrapingDetection(win, request.url);
                } catch (error) {
                    // The obfuscated anti-scraping detections can throw on pages whose DOM they do
                    // not expect (e.g. `removeChild` on a node missing after the reader hydrates).
                    // A failing detection must not block scraping: treat it as "no challenge".
                    console.warn('CheckAntiScrapingDetection failed, assuming no challenge:', error);
                    redirect = FetchRedirection.None;
                }

                // No site-specific detection fired: fall back to the generic Cloudflare DOM heuristic
                // so challenges on sites without a custom detection (MangaFire, Comix, …) still
                // auto-resolve in the background without flashing a window.
                if (redirect === FetchRedirection.None && cloudflare?.isChallenge) {
                    redirect = cloudflare.hasRealWidget ? FetchRedirection.Interactive : FetchRedirection.Automatic;
                    invocations.push({ name: 'CloudflareDetected', info: cloudflare.hasRealWidget ? 'Interactive (real widget)' : 'Automatic (managed, wait for auto-resolve)' });
                }

                console.warn("[KUMO] redirect:", FetchRedirection[redirect], "url:", request?.url);
                invocations.push({ name: 'performRedirectionOrFinalize()', info: `Mode: ${FetchRedirection[ redirect ]}` });

                // Start poller only for sites that opted into the stalled-challenge reload
                // (reloading other sites' challenges — e.g. MangaFire's custom WAF — loops forever)
                const stalledReloadEnabled = ShouldReloadStalledChallenge(request.url);
                if (stalledReloadEnabled && reloadBudget.remaining > 0) {
                    stopPollers.push(await this.ReloadStalledCloudFlareChallenge(win, request.url, reloadBudget, invocations, clearanceBaseline));
                }

                const enterInteractive = async () => {
                    // NOTE: Allow the user to solve the captcha within 2.5 minutes before rejecting the request with an error
                    ClearTimeout(cancellation);
                    cancellation = await SetTimeout(() => {
                        if (!settled) {
                            settled = true;
                            void destroy();
                            reject(new Exception(R.FetchProvider_FetchWindow_TimeoutError));
                        }
                    }, 150_000);
                    await win.Show();
                    // In-place challenges (e.g. JapScan's `#jc-overlay` puzzle) resolve without
                    // a navigation, so DOMReady never fires again and the extraction script would
                    // never run. Poll until the challenge clears, then run the script on the
                    // now-usable reader page.
                    this.PollForChallengeResolution(win, request.url, cloudflareDetectionScript, runScript, () => settled, stopPollers, invocations, clearanceBaseline);
                };

                const enterAutomatic = () => {
                    // A managed Cloudflare challenge can require a VISIBLE window to issue its
                    // clearance (JapScan: `LESSONS.md` "JapScan et CrunchyScan ont besoin de cette
                    // fenêtre"; CrunchyScan: the cookie is only issued while shown). Fork-handled
                    // sites therefore all show the window before polling — the behaviour restored
                    // by `1bb8d2fc1`, which the `enterAutomatic` refactor of `1dfea5555` had lost
                    // (its comment scoped visibility to the stalled-reload opt-in only, leaving
                    // JapScan backgrounded: the challenge then never resolves → timeout → the
                    // caller retries → new window → visible loop).
                    if (ShouldUseForkChallengeHandling(request.url)) {
                        void win.Show().then(() => this.PollForChallengeResolution(
                            win,
                            request.url,
                            cloudflareDetectionScript,
                            runScript,
                            () => settled,
                            stopPollers,
                            invocations,
                            clearanceBaseline,
                        ));
                    }
                };

                switch (redirect) {
                    case FetchRedirection.Interactive:
                        await enterInteractive();
                        break;
                    case FetchRedirection.Automatic:
                        enterAutomatic();
                        break;
                    default:
                        // Site-specific challenges may be rendered asynchronously, AFTER the
                        // DOMReady that triggered this classification: JapScan's own anti-bot
                        // decides via an AJAX call (a few seconds after the page loaded) whether
                        // its `#jc-overlay` puzzle is required — typically on the SECOND reader
                        // request in a row (e.g. downloading one volume and immediately asking
                        // for the next one). A single detection at DOMReady therefore reports
                        // `None` too early and the extraction starts on a page that is about to
                        // be locked by the puzzle, silently yielding an incomplete page list.
                        // For visible fetches on fork-handled sites (the reader extraction),
                        // show the window and re-run the site detection for a short grace
                        // period; upgrade to the Interactive/Automatic handling as soon as the
                        // puzzle shows up during that window.
                        if (ShouldUseForkChallengeHandling(request.url) && show && !settled) {
                            const grace = 16_000;
                            const step = 2_000;
                            await win.Show();
                            invocations.push({ name: 'AsyncChallengeGrace', info: `Re-polling site detection for ${grace / 1000}s` });
                            let upgraded = FetchRedirection.None;
                            for (let waited = 0; waited < grace && !settled; waited += step) {
                                await Delay(step);
                                if (settled) break;
                                try {
                                    upgraded = await CheckAntiScrapingDetection(win, request.url);
                                } catch {
                                    // Transient navigation race: keep polling
                                    upgraded = FetchRedirection.None;
                                }
                                if (upgraded !== FetchRedirection.None) break;
                            }
                            if (upgraded !== FetchRedirection.None) {
                                console.warn("[KUMO] redirect (grace re-check):", FetchRedirection[upgraded], "url:", request?.url);
                                invocations.push({ name: 'AsyncChallengeDetected', info: `Mode: ${FetchRedirection[ upgraded ]}` });
                            }
                            if (upgraded === FetchRedirection.Interactive) {
                                await enterInteractive();
                                break;
                            }
                            if (upgraded === FetchRedirection.Automatic) {
                                enterAutomatic();
                                break;
                            }
                        }
                        await runScript();
                }
            });

            invocations.push({ name: 'Open', info: `Request URL: ${request.url}` });
            try {
                await win.Open(request, this.featureFlags.VerboseFetchWindow.Value, preload);
            } catch (error) {
                await destroy();
                settled = true;
                ClearTimeout(cancellation);
                reject(error);
            }
        });
    }
}
