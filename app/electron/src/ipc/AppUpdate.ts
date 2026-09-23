import path from 'node:path';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { app, shell } from 'electron';
import type { IPC, Callback } from './InterProcessCommunication';
import { AppUpdate as Channels } from '../../../src/ipc/Channels';

const execFileAsync = promisify(execFile);

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
 * Updater: checks the latest GitHub release, notifies the renderer, and optionally
 * downloads + installs the update by replacing the app directory and restarting.
 */
export class AppUpdate {

    constructor(private readonly ipc: IPC<Channels.Web, Channels.App>) {
        ipc.Listen(Channels.App.Check, this.Check.bind(this) as Callback<IUpdateInfo | null>);
        ipc.Listen(Channels.App.DownloadAndInstall, this.DownloadAndInstall.bind(this) as Callback<string>);
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
            return null;
        }
    }

    /**
     * Download the platform-specific zip from GitHub releases and install it.
     * Uses native OS tools (PowerShell on Windows, unzip on macOS/Linux) — zero npm deps.
     */
    private async DownloadAndInstall(version: string): Promise<string> {
        const repository = await this.GetRepository();
        if (!repository) return 'Error: repository not configured';

        const platformMap: Record<string, string> = {
            win32: 'win32-x64',
            darwin: 'darwin-x64',
            linux: 'linux-x64',
        };
        const platform = platformMap[process.platform];
        if (!platform) return `Error: unsupported platform ${process.platform}`;

        const zipName = `hakuneko-${platform}.zip`;
        const downloadUrl = `https://github.com/${repository}/releases/download/${version}/${zipName}`;

        try {
            const response = await fetch(downloadUrl, {
                headers: { 'User-Agent': 'hakuneko-updater' },
                signal: AbortSignal.timeout(300_000),
            });
            if (!response.ok) return `Error: download failed (${response.status})`;

            const buffer = Buffer.from(await response.arrayBuffer());
            const tmpDir = path.join(app.getPath('temp'), `hakuneko-update-${version}`);
            const zipFile = path.join(tmpDir, zipName);

            await fs.mkdir(tmpDir, { recursive: true });
            await fs.writeFile(zipFile, buffer);

            const extractDir = path.join(tmpDir, 'extracted');
            await fs.mkdir(extractDir, { recursive: true });

            // Platform-native zip extraction (no npm dependency)
            if (process.platform === 'win32') {
                await execFileAsync('powershell', ['-NoProfile', '-Command',
                    `Expand-Archive -Path "${zipFile}" -DestinationPath "${extractDir}" -Force`]);
            } else {
                await execFileAsync('unzip', ['-o', zipFile, '-d', extractDir]);
            }

            // Find the extracted app directory
            const entries = await fs.readdir(extractDir);
            const appDir = entries.length === 1 ? path.join(extractDir, entries[0]) : extractDir;

            const appDirPath = app.getAppPath();
            const appRoot = process.resourcesPath ? path.resolve(process.resourcesPath, '..') : path.dirname(appDirPath);

            if (process.platform === 'win32') {
                const batScript = path.join(tmpDir, 'update.bat');
                const batContent = [
                    '@echo off',
                    'timeout /t 2 /nobreak > nul',
                    `xcopy /E /I /Y "${appDir}" "${appRoot}"`,
                    `del /Q "${zipFile}"`,
                    `rmdir /S /Q "${tmpDir}"`,
                    `start "" "${process.execPath}"`,
                    'del "%~f0"',
                ].join('\r\n');
                await fs.writeFile(batScript, batContent, 'utf-8');
                shell.openPath(batScript);
            } else {
                const shScript = path.join(tmpDir, 'update.sh');
                const shContent = [
                    '#!/bin/bash',
                    'sleep 2',
                    `cp -r "${appDir}/"* "${appRoot}/"`,
                    `rm -f "${zipFile}"`,
                    `rm -rf "${tmpDir}"`,
                    `"${process.execPath}" &`,
                    'rm -- "$0"',
                ].join('\n');
                await fs.writeFile(shScript, shContent, { mode: 0o755 });
                shell.openPath(shScript);
            }

            setTimeout(() => app.quit(), 1000);
            return 'Updating... The app will restart automatically.';
        } catch (error) {
            return `Error: ${error instanceof Error ? error.message : 'unknown error'}`;
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
