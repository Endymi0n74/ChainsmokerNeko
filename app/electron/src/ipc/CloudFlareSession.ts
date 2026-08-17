import fs from 'node:fs/promises';
import path from 'node:path';
import { app, session } from 'electron';

interface PersistedCookie {
    domain: string;
    value: string;
    path: string;
    secure: boolean;
    httpOnly: boolean;
    sameSite: Electron.Cookie['sameSite'];
}

interface Snapshot {
    version: number;
    savedAt: number;
    cookies: PersistedCookie[];
}

const ClearanceCookie = 'cf_clearance';
// cf_clearance is validated server-side and normally lives ~a year; the local copy is
// refreshed on every launch/change so it never expires from disk while the app is in use.
const PersistForSeconds = 30 * 24 * 60 * 60;

let installed = false;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Persists the `cf_clearance` cookies across restarts.
 *
 * The Cloudflare challenge solved in a remote browser window injects the cookie through
 * the site's own `Set-Cookie`, often as a *session* cookie (no expiry) which Chromium
 * drops on quit. This service snapshots every `cf_clearance` cookie to disk as soon as it
 * arrives and re-injects it (with a fresh 1-month expiry) on the next launch, so the
 * user does not have to re-warm the challenge after every restart.
 *
 * A restored cookie can still be stale (Cloudflare may have revoked it server-side or it
 * may be bound to another IP/user-agent); in that case the normal challenge flow simply
 * kicks in again and re-populates the snapshot.
 */
export class CloudFlareSession {

    private static SnapshotFile(): string {
        return path.join(app.getPath('userData'), 'cloudflare-clearance.json');
    }

    /**
     * Reads every `cf_clearance` cookie currently in the shared session and writes them
     * to the snapshot file.
     */
    public static async Save(): Promise<void> {
        const cookies = await session.defaultSession.cookies.get({ name: ClearanceCookie });
        const snapshot: Snapshot = {
            version: 1,
            savedAt: Date.now(),
            cookies: cookies
                .filter((cookie): cookie is Electron.Cookie & { domain: string } => Boolean(cookie.domain && cookie.value))
                .map(cookie => ({
                    domain: cookie.domain,
                    value: cookie.value,
                    path: cookie.path || '/',
                    secure: cookie.secure ?? true,
                    httpOnly: cookie.httpOnly ?? true,
                    sameSite: cookie.sameSite ?? 'no_restriction',
                })),
        };
        await fs.writeFile(this.SnapshotFile(), JSON.stringify(snapshot, null, 2), 'utf-8');
    }

    /**
     * Re-injects the persisted `cf_clearance` cookies into the shared session with a fresh
     * 1-month expiry, so the first listing after a restart reuses the warmed-up clearance.
     */
    public static async Restore(): Promise<void> {
        let snapshot: Snapshot;
        try {
            snapshot = JSON.parse(await fs.readFile(this.SnapshotFile(), 'utf-8')) as Snapshot;
        } catch {
            return; // No previous snapshot — nothing to restore.
        }
        for (const cookie of snapshot.cookies ?? []) {
            if (!cookie?.domain || !cookie?.value) continue;
            try {
                await session.defaultSession.cookies.set({
                    url: `https://${cookie.domain.replace(/^\./, '')}/`,
                    name: ClearanceCookie,
                    value: cookie.value,
                    domain: cookie.domain,
                    path: cookie.path || '/',
                    secure: cookie.secure ?? true,
                    httpOnly: cookie.httpOnly ?? true,
                    sameSite: cookie.sameSite ?? 'no_restriction',
                    expirationDate: Math.round(Date.now() / 1000 + PersistForSeconds),
                });
            } catch (error) {
                console.warn(`[CloudFlareSession] Failed to restore ${ClearanceCookie} for ${cookie.domain}:`, error);
            }
        }
    }

    /**
     * Restores any persisted clearance at boot, then keeps the snapshot up to date whenever
     * a `cf_clearance` cookie is added, changed or removed in the session.
     */
    public static async Install(): Promise<void> {
        if (installed) return;
        installed = true;
        await this.Restore();
        session.defaultSession.cookies.on('changed', (_event, cookie) => {
            if (cookie.name !== ClearanceCookie) return;
            // A challenge can set several cookies in quick succession; debounce the snapshot.
            if (saveTimer) clearTimeout(saveTimer);
            saveTimer = setTimeout(() => {
                void this.Save().catch(error => console.warn('[CloudFlareSession] Snapshot failed:', error));
            }, 1000);
        });
    }
}
