import path from 'node:path';
import fs from 'node:fs/promises';
import { app } from 'electron';
import type { IPC, Callback } from './InterProcessCommunication';
import { AppUpdate as Channels } from '../../../src/ipc/Channels';

/** Update descriptor returned to the renderer when a newer release exists. */
export type IUpdateInfo = {
    version: string;
    url: string;
    notes: string;
} & JSONObject;

/**
 * Compares two dotted version strings (an optional leading `v` is ignored).
 * Returns a negative number when `left < right`, zero when equal, positive when `left > right`.
 */
export function CompareVersions(left: string, right: string): number {
    const parse = (version: string): number[] => version
        .replace(/^v/i, '')
        .split('.')
        .map(part => {
            const value = parseInt(part, 10);
            return Number.isNaN(value) ? 0 : value;
        });
    const a = parse(left);
    const b = parse(right);
    for (let index = 0; index < Math.max(a.length, b.length); index++) {
        const diff = (a[index] ?? 0) - (b[index] ?? 0);
        if (diff !== 0) return diff;
    }
    return 0;
}

/**
 * Notify-only updater: checks the latest GitHub release and lets the renderer show a
 * download link when a newer version exists. It deliberately does NOT self-install —
 * the app is distributed as plain zips/dmg/AppImage (no NSIS/Squirrel metadata), so the
 * `electron-updater` binary-diff providers cannot be used without switching the whole
 * build to `electron-builder` and code-signing the artifacts.
 */
export class AppUpdate {

    constructor(private readonly ipc: IPC<Channels.Web, Channels.App>) {
        ipc.Listen(Channels.App.Check, this.Check.bind(this) as Callback<IUpdateInfo | null>);
    }

    private async Check(): Promise<IUpdateInfo | null> {
        const repository = await this.GetRepository();
        if (!repository) return null;
        try {
            const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, {
                headers: {
                    Accept: 'application/vnd.github+json',
                    'User-Agent': 'hakuneko-update-checker',
                },
                signal: AbortSignal.timeout(15000),
            });
            if (!response.ok) return null;
            const release = await response.json() as { tag_name?: string, html_url?: string, body?: string };
            const latest = release.tag_name;
            if (!latest || CompareVersions(latest, app.getVersion()) <= 0) return null;
            return {
                version: latest.replace(/^v/i, ''),
                url: release.html_url || `https://github.com/${repository}/releases/tag/${latest}`,
                notes: release.body ?? '',
            };
        } catch {
            // Offline, rate-limited or network failure — never break the app for an update check.
            return null;
        }
    }

    private async GetRepository(): Promise<string> {
        try {
            const file = path.resolve(app.getAppPath(), 'package.json');
            const manifest = JSON.parse(await fs.readFile(file, 'utf-8')) as { repository?: string };
            return manifest.repository ?? '';
        } catch {
            return '';
        }
    }
}
