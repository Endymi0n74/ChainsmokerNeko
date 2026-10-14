import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { session, BrowserWindow } from 'electron';
import type { IPC, Callback } from './InterProcessCommunication';
import { CloudFlareImport as Channels } from '../../../src/ipc/Channels';

/** Time the hidden window gets to run the page scripts and show JapScan's puzzle, if any. */
const RenderedCheckBudget = 10_000;
const RenderedPollInterval = 1_000;

interface Diagnosis {
    blocked: boolean;
    inconclusive: boolean;
    reason: string;
    title: string;
}

/** DOM state read from the hidden window after its scripts ran. */
interface RenderedPage {
    /** `#jc-overlay` is rendered and visible (hidden by CSS once solved). */
    overlay: boolean;
    title: string;
}

/** Evaluated in the hidden window: the overlay counts only when CSS actually shows it. */
export const RenderedPageScript = `
    (() => {
        const overlay = document.querySelector('#jc-overlay');
        let visible = false;
        if (overlay) {
            const style = window.getComputedStyle(overlay);
            visible = style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity) > 0 && overlay.offsetHeight > 0;
        }
        return { overlay: visible, title: document.title || '' };
    })()
`;

interface BrowserProfile {
    name: string;
    userDataDir: string;
    /** Keychain service name for this browser on macOS ("Chrome Safe Storage", …). */
    keychainService?: string;
}

interface DecryptedCookie {
    value: string;
    expires?: Date;
}

/** Thrown when the browser encrypts cookies with App-Bound Encryption (v20), which is not decryptable externally. */
class AppBoundEncryptionError extends Error {
    constructor() {
        super('App-Bound Encryption (v20)');
    }
}

/** Thrown for user-facing, descriptive import failures (keychain, unsupported platform, …). */
class ImportError extends Error {}

/**
 * Lets the user unblock a site behind Cloudflare by reusing the `cf_clearance` cookie that
 * their real browser (Edge/Chrome) already obtained. The cookie is read from the browser's
 * encrypted SQLite store and injected into the app's shared session.
 *
 * The key is recovered per platform, without any third-party dependency:
 * - Windows: the 32-byte AES key is DPAPI-unwrapped via PowerShell (built into Windows).
 *   Electron's `safeStorage` is NOT usable here: it produces its own v10 AES-GCM payload
 *   with an app-owned key, which is incompatible with Chrome's raw DPAPI blobs.
 * - macOS: the 16-byte key is derived with PBKDF2-HMAC-SHA1 (1003 rounds, salt "saltysalt")
 *   from the "Chrome Safe Storage" Keychain password, read with the built-in `security` CLI.
 * - Linux: the 16-byte key is derived with PBKDF2-HMAC-SHA1 (1 round, salt "saltysalt") from
 *   the hardcoded "peanuts" passphrase (v10), or from the Secret Service keyring (v11) when
 *   `secret-tool` is available.
 *
 * Cookies are v10 AES-256-GCM on Windows, v10/v11 AES-128-CBC (IV = 16 spaces) elsewhere.
 * Chromium (DB version >= 24) prefixes cookie values with a 32-byte SHA256(host_key) block;
 * it is stripped after decryption.
 *
 * Chromium locks the cookie database while the browser is running, so auto-import only works
 * when the browser is closed; `SetClearance` provides a manual paste fallback for that case.
 */
export class CloudFlareImport {

    private readonly keyCache = new Map<string, Buffer[]>();

    constructor(private readonly ipc: IPC<Channels.Web, Channels.App>) {
        this.ipc.Listen<string>(Channels.App.ImportFromBrowser, this.ImportFromBrowser.bind(this) as Callback<string>);
        this.ipc.Listen<string>(Channels.App.SetClearance, this.SetClearance.bind(this) as Callback<string>);
        this.ipc.Listen<string>(Channels.App.TestClearance, this.TestClearance.bind(this) as Callback<string>);
    }

    private NormalizeHost(host: string): string {
        return host.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    }

    /**
     * Accepts the bare cookie value, but also the forms copied from DevTools or a log line
     * (`cf_clearance=...`, `cf_clearance :"..."`, a trailing `;` or surrounding quotes).
     * Anything else would be stored verbatim and never match Cloudflare's cookie.
     */
    private CleanClearanceValue(value: string): string {
        let cleaned = value.trim().replace(/^cf_clearance\s*[:=]\s*/i, '');
        cleaned = cleaned.split(';')[0].trim();
        return cleaned.replace(/^["']+|["']+$/g, '').trim();
    }

    private async SetClearance(host: string, value: string): Promise<string> {
        const domain = this.NormalizeHost(host);
        const cookieValue = this.CleanClearanceValue(value);
        if (!domain || !cookieValue) {
            return 'Invalid host or cookie value.';
        }
        await this.InjectCookie(domain, cookieValue);
        return `cf_clearance injected for ${domain}.`;
    }

    /**
     * Verifies whether the `cf_clearance` cookie currently in the shared session actually
     * unblocks the site, by fetching its home page through Chromium's network stack (which
     * sends the session cookies) and inspecting the response for a Cloudflare challenge.
     */
    private async TestClearance(host: string): Promise<string> {
        const domain = this.NormalizeHost(host);
        if (!domain) {
            return 'Invalid host.';
        }
        const url = `https://${domain}/`;
        try {
            const cookies = await session.defaultSession.cookies.get({ url, name: 'cf_clearance' });
            if (cookies.length === 0) {
                return `No cf_clearance cookie for ${domain} yet — import it from the browser or inject a value first.`;
            }
            const userAgent = session.defaultSession.getUserAgent();
            const response = await session.defaultSession.fetch(url, {
                method: 'GET',
                redirect: 'follow',
                signal: AbortSignal.timeout(20000),
                headers: {
                    'User-Agent': userAgent,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                },
            });
            const body = await response.text();
            const htmlDiagnosis = this.DiagnoseResponse(response.status, response.headers, body);
            // JapScan's puzzle is injected by JavaScript, so the raw HTML cannot show it: read the rendered DOM too.
            const diagnosis = htmlDiagnosis.blocked ? htmlDiagnosis : this.JudgeRendered(await this.CheckRenderedPage(url), htmlDiagnosis);
            const details = `HTTP ${response.status}, ${body.length} bytes, title "${diagnosis.title}", User-Agent: ${userAgent}`;
            if (diagnosis.blocked) {
                return `Still blocked — ${diagnosis.reason} (${details}). Re-import or paste a fresh cf_clearance, or solve the challenge in the plugin window.`;
            }
            if (diagnosis.inconclusive) {
                return `Inconclusive — ${diagnosis.reason} (${details}). Open the site in the plugin window to confirm.`;
            }
            if (response.status >= 400) {
                return `Reached the site but got ${details} — likely still protected.`;
            }
            return `Unblocked — the real page loaded (${details}).`;
        } catch (error) {
            const name = (error as { name?: string })?.name;
            const message = (error as { message?: string })?.message;
            if (name === 'AbortError' || name === 'TimeoutError') {
                return `Test timed out for ${domain} — the connection may be stuck in a challenge.`;
            }
            return `Test failed: ${message ?? String(error)}`;
        }
    }

    /**
     * Classifies a response so the test reports what blocks the request: a Cloudflare
     * interstitial (challenge markers or a Cloudflare error status), the JapScan puzzle, or
     * only the Cloudflare scripts that every proxied page embeds, which prove nothing on their own.
     */
    private DiagnoseResponse(status: number, headers: Headers, body: string): Diagnosis {
        const lower = body.toLowerCase();
        const title = (body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').replace(/\s+/g, ' ').trim().slice(0, 120) || 'none';
        const interstitial = ['just a moment', 'cf-chl-', 'checking your browser', 'attention required'].filter(marker => lower.includes(marker));
        const embedded = ['challenge-platform', 'challenges.cloudflare.com', 'cf-turnstile'].filter(marker => lower.includes(marker));
        const cloudflareStatus = (headers.get('server') ?? '').toLowerCase() === 'cloudflare' && [403, 429, 503].includes(status);
        if (interstitial.length > 0 || cloudflareStatus) {
            const markers = cloudflareStatus ? [...interstitial, `server status ${status}`] : interstitial;
            return { blocked: true, inconclusive: false, reason: `Cloudflare challenge (${markers.join(', ')})`, title };
        }
        if (lower.includes('jc-overlay')) {
            return { blocked: true, inconclusive: false, reason: 'JapScan puzzle (#jc-overlay) in the page', title };
        }
        if (embedded.length > 0 && status < 400) {
            return { blocked: false, inconclusive: true, reason: `no Cloudflare interstitial, only embedded scripts (${embedded.join(', ')}) which normal proxied pages carry too`, title };
        }
        return { blocked: false, inconclusive: false, reason: '', title };
    }

    /**
     * Loads the page in a hidden window sharing the app session and reads the DOM once its
     * scripts ran, polling until the puzzle overlay is visible or the budget is spent.
     * Errors propagate to `TestClearance`, which reports them as a failed test.
     */
    private async CheckRenderedPage(url: string): Promise<RenderedPage> {
        const win = new BrowserWindow({
            show: false,
            webPreferences: {
                sandbox: true,
                session: session.defaultSession,
            },
        });
        try {
            await win.loadURL(url);
            const deadline = Date.now() + RenderedCheckBudget;
            let page: RenderedPage;
            do {
                page = await win.webContents.executeJavaScript(RenderedPageScript, true) as RenderedPage;
                if (page.overlay) {
                    break;
                }
                await new Promise(resolve => setTimeout(resolve, RenderedPollInterval));
            } while (Date.now() < deadline);
            return page;
        } finally {
            win.destroy();
        }
    }

    /** The rendered DOM overrides the raw HTML: a visible puzzle or a challenge title means still blocked. */
    private JudgeRendered(page: RenderedPage, html: Diagnosis): Diagnosis {
        if (page.overlay) {
            return { blocked: true, inconclusive: false, reason: 'JapScan puzzle (#jc-overlay) visible in the rendered page', title: html.title };
        }
        if (/just a moment|un instant|attention required|checking your browser/i.test(page.title)) {
            return { blocked: true, inconclusive: false, reason: `Cloudflare challenge in the rendered page (title "${page.title}")`, title: html.title };
        }
        if (html.inconclusive) {
            return { ...html, reason: `${html.reason}; no JapScan puzzle visible in the rendered page after ${RenderedCheckBudget / 1000} s` };
        }
        return html;
    }

    private async ImportFromBrowser(host: string): Promise<string> {
        const domain = this.NormalizeHost(host);
        if (!domain) {
            return 'Invalid host.';
        }
        const browsers = this.FindBrowsers();
        if (browsers.length === 0) {
            return 'No Chromium browser profile found (Edge or Chrome).';
        }
        // Try every browser profile before giving up: Edge may be locked or use App-Bound
        // Encryption (v20) while Chrome still exposes a v10 cookie (or vice versa).
        const failures: string[] = [];
        for (const browser of browsers) {
            try {
                const cookie = await this.ReadCookie(browser, domain);
                if (cookie) {
                    await this.InjectCookie(domain, cookie.value);
                    const expiry = cookie.expires ? cookie.expires.toUTCString() : 'unknown';
                    return `Imported cf_clearance for ${domain} from ${browser.name} (browser expiry ${expiry}).`;
                }
                failures.push(`${browser.name}: no cf_clearance cookie for ${domain}`);
            } catch (error) {
                if (error instanceof AppBoundEncryptionError) {
                    failures.push(`${browser.name}: App-Bound Encryption (v20)`);
                } else if (error instanceof ImportError) {
                    failures.push(`${browser.name}: ${error.message}`);
                } else if (this.IsBusyError(error)) {
                    failures.push(`${browser.name}: running (cookie store locked)`);
                } else {
                    failures.push(`${browser.name}: could not be read`);
                }
            }
        }
        if (failures.length > 0 && failures.every(failure => failure.includes('v20'))) {
            return 'App-Bound Encryption (v20) is enabled — paste the cf_clearance value manually instead.';
        }
        if (failures.length > 0 && failures.every(failure => failure.includes('locked'))) {
            return 'The browser is running and its cookie store is locked — close it or paste the value manually.';
        }
        return `Could not import cf_clearance for ${domain} (${failures.join('; ')}). Paste the value manually instead.`;
    }

    private FindBrowsers(): BrowserProfile[] {
        const home = os.homedir();
        switch (process.platform) {
            case 'win32': {
                const local = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
                return [
                    { name: 'Edge', userDataDir: path.join(local, 'Microsoft', 'Edge', 'User Data') },
                    { name: 'Chrome', userDataDir: path.join(local, 'Google', 'Chrome', 'User Data') },
                ].filter(browser => fs.existsSync(browser.userDataDir));
            }
            case 'darwin':
                return [
                    { name: 'Edge', userDataDir: path.join(home, 'Library', 'Application Support', 'Microsoft Edge'), keychainService: 'Microsoft Edge Safe Storage' },
                    { name: 'Chrome', userDataDir: path.join(home, 'Library', 'Application Support', 'Google', 'Chrome'), keychainService: 'Chrome Safe Storage' },
                ].filter(browser => fs.existsSync(browser.userDataDir));
            case 'linux':
                return [
                    { name: 'Edge', userDataDir: path.join(home, '.config', 'microsoft-edge') },
                    { name: 'Chrome', userDataDir: path.join(home, '.config', 'google-chrome') },
                    { name: 'Chromium', userDataDir: path.join(home, '.config', 'chromium') },
                ].filter(browser => fs.existsSync(browser.userDataDir));
            default:
                return [];
        }
    }

    private async InjectCookie(host: string, value: string): Promise<void> {
        await session.defaultSession.cookies.set({
            url: `https://${host}/`,
            name: 'cf_clearance',
            value,
            domain: `.${host}`,
            path: '/',
            secure: true,
            httpOnly: true,
            // cf_clearance is validated server-side; keep it available locally for a month.
            expirationDate: Math.round(Date.now() / 1000 + 30 * 24 * 60 * 60),
            sameSite: 'no_restriction',
        });
    }

    private IsBusyError(error: unknown): boolean {
        const code = (error as NodeJS.ErrnoException)?.code;
        return code === 'EBUSY' || code === 'EPERM' || code === 'EAGAIN';
    }

    private async ReadCookie(browser: BrowserProfile, host: string): Promise<DecryptedCookie | null> {
        // 1. The cookie database is locked while the browser runs, so work on a temporary copy.
        const source = path.join(browser.userDataDir, 'Default', 'Network', 'Cookies');
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hakuneko-cookies-'));
        const copy = path.join(tempDir, 'Cookies');
        try {
            fs.writeFileSync(copy, fs.readFileSync(source));
            for (const suffix of ['-journal', '-wal', '-shm']) {
                try {
                    fs.writeFileSync(copy + suffix, fs.readFileSync(source + suffix));
                } catch {
                    // Optional sidecar files may not exist or may be locked.
                }
            }

            const database = new DatabaseSync(copy, { readOnly: true });
            try {
                // `expires_utc` (microseconds since 1601) exceeds Number.MAX_SAFE_INTEGER,
                // so cast it to TEXT to avoid node:sqlite throwing on the overflow.
                const rows = database.prepare(`
                    SELECT name, encrypted_value, CAST(expires_utc AS TEXT) AS expires_utc
                    FROM cookies WHERE host_key LIKE ? ORDER BY creation_utc DESC
                `).all(`%${host}`);
                for (const row of rows) {
                    if (row.name !== 'cf_clearance') {
                        continue;
                    }
                    const value = this.DecryptCookie(row.encrypted_value as Uint8Array, browser);
                    if (value) {
                        return {
                            value,
                            expires: this.FromChromiumTime(row.expires_utc),
                        };
                    }
                }
                return null;
            } finally {
                database.close();
            }
        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    }

    /** Returns the AES key candidates for the given browser, cached per profile. */
    private GetCandidateKeys(browser: BrowserProfile): Buffer[] {
        const cached = this.keyCache.get(browser.userDataDir);
        if (cached) {
            return cached;
        }
        const keys: Buffer[] = [];
        switch (process.platform) {
            case 'win32':
                keys.push(this.DecryptKeyWindows(this.ReadLocalStateKey(browser)));
                break;
            case 'darwin': {
                const password = this.GetKeychainPassword(browser);
                keys.push(this.DeriveKey(password, 1003));
                const localStateKey = this.DecryptKeyMacLocalState(browser, password);
                if (localStateKey) {
                    keys.push(localStateKey);
                }
                break;
            }
            case 'linux': {
                // v10: hardcoded passphrase; v11: Secret Service keyring (best-effort).
                keys.push(this.DeriveKey('peanuts', 1));
                const keyringPassword = this.GetKeyringPassword();
                if (keyringPassword) {
                    keys.push(this.DeriveKey(keyringPassword, 1));
                }
                break;
            }
            default:
                throw new ImportError(`unsupported platform ${process.platform}`);
        }
        this.keyCache.set(browser.userDataDir, keys);
        return keys;
    }

    private ReadLocalStateKey(browser: BrowserProfile): string {
        const localStateFile = path.join(browser.userDataDir, 'Local State');
        const localState = JSON.parse(fs.readFileSync(localStateFile, 'utf8'));
        const encryptedKey = localState.os_crypt?.encrypted_key;
        if (!encryptedKey) {
            throw new ImportError('no os_crypt.encrypted_key in Local State');
        }
        return encryptedKey;
    }

    /**
     * Windows: the AES key is a DPAPI blob ("DPAPI" prefix) stored in Local State.
     * DPAPI (CryptUnprotectData) requires the OS crypto API — there is no pure-JS path.
     * We shell out to PowerShell, which ships with every supported Windows version.
     */
    private DecryptKeyWindows(encryptedKey: string): Buffer {
        const script = [
            'Add-Type -AssemblyName System.Security',
            '$b64 = $env:HAKUNEKO_ENCKEY',
            '$bytes = [Convert]::FromBase64String($b64)',
            '$key = $bytes[5..($bytes.Length-1)]',
            '$dec = [System.Security.Cryptography.ProtectedData]::Unprotect($key, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)',
            '[Convert]::ToBase64String($dec)',
        ].join('\n');
        const output = execFileSync('powershell', ['-NoProfile', '-Command', script], {
            encoding: 'utf8',
            env: { ...process.env, HAKUNEKO_ENCKEY: encryptedKey },
        }).trim();
        return Buffer.from(output, 'base64');
    }

    /** macOS: the passphrase lives in the login Keychain as a generic password. */
    private GetKeychainPassword(browser: BrowserProfile): string {
        if (!browser.keychainService) {
            throw new ImportError('no Keychain service for macOS');
        }
        try {
            const output = execFileSync('security', ['find-generic-password', '-w', '-s', browser.keychainService], {
                encoding: 'utf8',
                timeout: 15000,
            }).trim();
            if (output) {
                return output;
            }
        } catch (error) {
            const status = (error as { status?: number })?.status;
            if (status === 44) {
                throw new ImportError(`Keychain access denied — allow "security" to read "${browser.keychainService}", or paste the value manually`);
            }
        }
        throw new ImportError(`"${browser.keychainService}" not found in the login Keychain — open the browser once, then retry`);
    }

    /** macOS: some profiles store the AES key in Local State, AES-CBC-encrypted with the derived key. */
    private DecryptKeyMacLocalState(browser: BrowserProfile, password: string): Buffer | null {
        try {
            const blob = Buffer.from(this.ReadLocalStateKey(browser), 'base64');
            const payload = blob.length > 5 && blob.toString('ascii', 0, 5) === 'DPAPI' ? blob.subarray(5) : blob;
            const decipher = crypto.createDecipheriv('aes-128-cbc', this.DeriveKey(password, 1003), Buffer.alloc(16, 0x20));
            const plain = Buffer.concat([decipher.update(payload), decipher.final()]);
            return plain.length === 16 ? plain : null;
        } catch {
            return null;
        }
    }

    /** Linux: best-effort read of the Secret Service keyring password (v11). */
    private GetKeyringPassword(): string | null {
        try {
            execFileSync('secret-tool', ['--version'], { stdio: 'ignore' });
        } catch {
            return null; // secret-tool not installed — only the v10 "peanuts" path is available
        }
        for (const app of ['chrome', 'chromium']) {
            try {
                const output = execFileSync('secret-tool', ['lookup', 'application', app], { encoding: 'utf8' }).trim();
                if (output) {
                    return output;
                }
            } catch {
                // not found for this application — try the next one
            }
        }
        return null;
    }

    private DeriveKey(password: string, iterations: number): Buffer {
        // Chromium derives with PBKDF2-HMAC-SHA1, salt "saltysalt":
        // 1003 iterations on macOS, 1 iteration on Linux, 128-bit key.
        return crypto.pbkdf2Sync(password, 'saltysalt', iterations, 16, 'sha1');
    }

    private DecryptCookie(encrypted: Uint8Array, browser: BrowserProfile): string {
        const buffer = Buffer.from(encrypted);
        if (buffer.length >= 3 && buffer.toString('ascii', 0, 3) === 'v20') {
            throw new AppBoundEncryptionError();
        }
        const keys = this.GetCandidateKeys(browser);
        const gcm = process.platform === 'win32';
        for (const key of keys) {
            try {
                const plain = gcm ? this.DecryptGCM(buffer, key) : this.DecryptCBC(buffer, key);
                if (plain.length > 0) {
                    return this.StripDomainHash(plain);
                }
            } catch {
                // Wrong key or corrupted payload — try the next candidate.
            }
        }
        return '';
    }

    /** Windows format: "v10" | 12-byte nonce | ciphertext | 16-byte auth tag (AES-256-GCM). */
    private DecryptGCM(buffer: Buffer, key: Buffer): Buffer {
        if (buffer.length < 31 || buffer.toString('ascii', 0, 3) !== 'v10') {
            return Buffer.alloc(0);
        }
        const nonce = buffer.subarray(3, 15);
        const tag = buffer.subarray(buffer.length - 16);
        const ciphertext = buffer.subarray(15, buffer.length - 16);
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    }

    /** macOS/Linux format: "v10"/"v11" | ciphertext (AES-128-CBC, IV = 16 spaces, PKCS7). */
    private DecryptCBC(buffer: Buffer, key: Buffer): Buffer {
        const prefix = buffer.length >= 3 ? buffer.toString('ascii', 0, 3) : '';
        if (prefix !== 'v10' && prefix !== 'v11') {
            return Buffer.alloc(0);
        }
        const payload = buffer.subarray(3);
        if (payload.length === 0 || payload.length % 16 !== 0) {
            return Buffer.alloc(0);
        }
        const decipher = crypto.createDecipheriv('aes-128-cbc', key, Buffer.alloc(16, 0x20));
        return Buffer.concat([decipher.update(payload), decipher.final()]);
    }

    /** Chromium (DB >= 24) prefixes cookie values with a 32-byte block; all current browsers write it. */
    private StripDomainHash(plain: Buffer): string {
        return plain.length >= 32 ? plain.subarray(32).toString('utf8') : plain.toString('utf8');
    }

    private FromChromiumTime(expiresUtc: unknown): Date | undefined {
        // Chromium stores timestamps as microseconds since 1601-01-01.
        // Values are cast to TEXT in SQL; parse as BigInt to avoid precision loss, then to ms.
        const value = typeof expiresUtc === 'string' ? BigInt(expiresUtc) : BigInt(expiresUtc as number | bigint);
        const milliseconds = Number(value / 1000n) - 11644473600000;
        if (!Number.isFinite(milliseconds)) {
            return undefined;
        }
        const date = new Date(milliseconds);
        return Number.isNaN(date.getTime()) ? undefined : date;
    }
}
