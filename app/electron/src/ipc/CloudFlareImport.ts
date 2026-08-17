import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { session } from 'electron';
import type { IPC, Callback } from './InterProcessCommunication';
import { CloudFlareImport as Channels } from '../../../src/ipc/Channels';

interface BrowserProfile {
    name: string;
    userDataDir: string;
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

/**
 * Lets the user unblock a site behind Cloudflare by reusing the `cf_clearance` cookie that
 * their real browser (Edge/Chrome) already obtained. The cookie is read from the browser's
 * encrypted SQLite store (DPAPI + AES-256-GCM) and injected into the app's shared session.
 *
 * Chromium locks the cookie database while the browser is running, so auto-import only works
 * when the browser is closed; `SetClearance` provides a manual paste fallback for that case.
 */
export class CloudFlareImport {

    constructor(private readonly ipc: IPC<Channels.Web, Channels.App>) {
        this.ipc.Listen<string>(Channels.App.ImportFromBrowser, this.ImportFromBrowser.bind(this) as Callback<string>);
        this.ipc.Listen<string>(Channels.App.SetClearance, this.SetClearance.bind(this) as Callback<string>);
    }

    private NormalizeHost(host: string): string {
        return host.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    }

    private async SetClearance(host: string, value: string): Promise<string> {
        const domain = this.NormalizeHost(host);
        if (!domain || !value.trim()) {
            return 'Invalid host or cookie value.';
        }
        await this.InjectCookie(domain, value.trim());
        return `cf_clearance injected for ${domain}.`;
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
        const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
        return [
            { name: 'Edge', userDataDir: path.join(localAppData, 'Microsoft', 'Edge', 'User Data') },
            { name: 'Chrome', userDataDir: path.join(localAppData, 'Google', 'Chrome', 'User Data') },
        ].filter(browser => fs.existsSync(browser.userDataDir));
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
        return code === 'EBUSY' || code === 'EPERM';
    }

    private async ReadCookie(browser: BrowserProfile, host: string): Promise<DecryptedCookie | null> {
        // 1. The AES key is stored DPAPI-encrypted in the browser's Local State.
        const localStateFile = path.join(browser.userDataDir, 'Local State');
        const localState = JSON.parse(fs.readFileSync(localStateFile, 'utf8'));
        const encryptedKey = localState.os_crypt?.encrypted_key;
        if (!encryptedKey) {
            return null;
        }
        const aesKey = this.DecryptKey(encryptedKey);

        // 2. The cookie database is locked while the browser runs, so work on a temporary copy.
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
                    const encrypted = Buffer.from(row.encrypted_value as Uint8Array);
                    if (this.IsAppBoundEncrypted(encrypted)) {
                        throw new AppBoundEncryptionError();
                    }
                    const value = this.DecryptCookie(encrypted, aesKey);
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

    private DecryptKey(encryptedKey: string): Buffer {
        // DPAPI is Windows-only; shell out to PowerShell (Chromium's key is per-user DPAPI protected).
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

    private IsAppBoundEncrypted(buffer: Buffer): boolean {
        return buffer.length >= 3 && buffer.toString('ascii', 0, 3) === 'v20';
    }

    private DecryptCookie(encrypted: Uint8Array, aesKey: Buffer): string {
        const buffer = Buffer.from(encrypted);
        // Chromium v10 format: "v10" | 12-byte nonce | ciphertext | 16-byte auth tag.
        if (buffer.length < 31 || buffer.toString('ascii', 0, 3) !== 'v10') {
            return '';
        }
        const nonce = buffer.subarray(3, 15);
        const tag = buffer.subarray(buffer.length - 16);
        const ciphertext = buffer.subarray(15, buffer.length - 16);
        try {
            const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, nonce);
            decipher.setAuthTag(tag);
            const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
            // Chromium 130+ prepends a 32-byte integrity block to cookie values before
            // AES-GCM encryption; strip it to recover the actual cookie value.
            return (plain.length > 32 ? plain.subarray(32) : plain).toString('utf8');
        } catch {
            return '';
        }
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
