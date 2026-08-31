import { session, BrowserWindow } from 'electron';
import { CloudFlareSession } from './CloudFlareSession';

const FirstCheckDelay = 30_000; // Let the app boot and settle before probing.
const RenewalPeriod = 6 * 60 * 60 * 1000; // Re-validate every 6 hours.
const RenewalTimeout = 120_000; // Max time spent re-warming a single domain per cycle.
const PollBaseDelay = 2_000;
const PollMaxDelay = 15_000;

const ChallengeMarkers = [
    'just a moment',
    'un instant',
    'cf-chl-',
    'challenge-platform',
    'challenges.cloudflare.com',
    'cf-turnstile',
    'checking your browser',
    'attention required',
    'verify you are human',
];

/**
 * Periodically validates the persisted `cf_clearance` cookies in the background
 * and silently re-warms the ones Cloudflare has revoked server-side.
 *
 * The whole cycle runs without flashing a window: the probe is a plain session
 * fetch, and the re-warm (only triggered when a domain actually re-challenges)
 * loads the site in a hidden window sharing the app session. Managed challenges
 * that require a visible widget cannot be solved in a hidden window — in that
 * case the cycle gives up quietly and the regular warm-up flow takes over, so
 * the user is never confronted with a spontaneously popping-up browser.
 */
export class CloudFlareRenewal {

    private static busy = false;

    public static Install(): void {
        setTimeout(() => void this.CheckAll(), FirstCheckDelay);
        setInterval(() => void this.CheckAll(), RenewalPeriod);
    }

    /** Force one renewal cycle right now (used by tests / diagnostics). */
    public static async CheckAll(): Promise<void> {
        if (this.busy) {
            return;
        }
        this.busy = true;
        try {
            const cookies = await session.defaultSession.cookies.get({ name: 'cf_clearance' });
            const domains = [ ...new Set(
                cookies
                    .map(cookie => (cookie.domain ?? '').replace(/^\./, ''))
                    .filter(Boolean)
            ) ];
            for (const domain of domains) {
                try {
                    await this.CheckDomain(domain);
                } catch (error) {
                    console.warn(`[CloudFlareRenewal] ${domain} check failed:`, error);
                }
            }
        } finally {
            this.busy = false;
        }
    }

    private static async CheckDomain(domain: string): Promise<void> {
        const url = `https://${domain}/`;
        if (!await this.FetchIsChallenge(url)) {
            return; // The stored clearance still unblocks the site.
        }
        console.warn(`[CloudFlareRenewal] ${domain} re-challenged — attempting silent background renewal`);
        const before = await this.GetClearanceValue(domain);
        const win = new BrowserWindow({
            show: false,
            webPreferences: {
                sandbox: true,
                session: session.defaultSession,
            },
        });
        try {
            await win.loadURL(url);
            const deadline = Date.now() + RenewalTimeout;
            let attempt = 0;
            while (Date.now() < deadline) {
                const after = await this.GetClearanceValue(domain);
                if (after && after.length > 200 && after !== before) {
                    await CloudFlareSession.Save();
                    console.log(`[CloudFlareRenewal] ${domain} clearance renewed in the background (${after.length} chars)`);
                    return;
                }
                // Exponential backoff so the hidden window gets time to complete
                // Cloudflare's proof phase without busy-polling.
                await new Promise(resolve => setTimeout(resolve, Math.min(PollBaseDelay * 2 ** attempt++, PollMaxDelay)));
            }
            console.warn(`[CloudFlareRenewal] ${domain} could not be renewed silently (managed challenge likely needs a visible window)`);
        } finally {
            win.destroy();
        }
    }

    private static async GetClearanceValue(domain: string): Promise<string> {
        const cookies = await session.defaultSession.cookies.get({ url: `https://${domain}/`, name: 'cf_clearance' });
        return cookies[0]?.value ?? '';
    }

    /** Probes the site through the shared session and detects a Cloudflare interstitial. */
    private static async FetchIsChallenge(url: string): Promise<boolean> {
        try {
            const response = await session.defaultSession.fetch(url, {
                method: 'GET',
                redirect: 'follow',
                signal: AbortSignal.timeout(20_000),
                headers: {
                    'User-Agent': session.defaultSession.getUserAgent(),
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                },
            });
            const body = (await response.text()).toLowerCase();
            if (ChallengeMarkers.some(marker => body.includes(marker))) {
                return true;
            }
            const server = response.headers.get('server')?.toLowerCase() ?? '';
            return server === 'cloudflare' && (response.status === 403 || response.status === 503 || response.status === 429);
        } catch {
            // Network error / unreachable site — leave the stored cookie alone.
            return false;
        }
    }
}
