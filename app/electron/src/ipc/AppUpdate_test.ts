import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { app } from 'electron';
import type { IPC } from './InterProcessCommunication';
import { AppUpdate, CompareVersions, UPDATE_CHECK_INTERVAL_MS, type IUpdateInfo } from './AppUpdate';
import { AppUpdate as Channels } from '../../../src/ipc/Channels';

vi.mock('electron', () => ({
    app: {
        getVersion: vi.fn(() => '0.1.10'),
        getAppPath: vi.fn(() => '/tmp/hakuneko-app'),
    },
}));

class TestFixture {

    public readonly mockIPC = {
        Listen: vi.fn(),
    } as unknown as IPC<Channels.Web, Channels.App>;

    public CreateTestee(): AppUpdate {
        return new AppUpdate(this.mockIPC);
    }

    public GetHandler(): () => Promise<IUpdateInfo | null> {
        const call = vi.mocked(this.mockIPC.Listen).mock.calls.find(([channel]) => channel === Channels.App.Check);
        return call?.[1] as () => Promise<IUpdateInfo | null>;
    }

    public GetDownloadHandler(): (version: string) => Promise<string> {
        const call = vi.mocked(this.mockIPC.Listen).mock.calls.find(([channel]) => channel === Channels.App.DownloadAndInstall);
        return call?.[1] as (version: string) => Promise<string>;
    }
}

let userDataDir: string;

beforeEach(async () => {
    userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hakuneko-appupdate-'));
    vi.mocked(app.getAppPath).mockReturnValue(userDataDir);
    vi.mocked(app.getVersion).mockReturnValue('0.1.10');
    await fs.writeFile(path.join(userDataDir, 'package.json'), JSON.stringify({ repository: 'Endymi0n74/ChainsmokerNeko' }), 'utf-8');
});

afterEach(async () => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    await fs.rm(userDataDir, { recursive: true, force: true });
});

describe('CompareVersions', () => {

    it('Should compare numeric segments', () => {
        expect(CompareVersions('0.1.10', '2.0.0')).toBeLessThan(0);
        expect(CompareVersions('2.0.0', '0.1.10')).toBeGreaterThan(0);
        expect(CompareVersions('2.0.0', '2.0.0')).toBe(0);
    });

    it('Should ignore a leading v', () => {
        expect(CompareVersions('v2.0.0', '2.0.0')).toBe(0);
        expect(CompareVersions('v2.0.1', '2.0.0')).toBeGreaterThan(0);
    });

    it('Should handle different segment counts', () => {
        expect(CompareVersions('2', '1.9.9')).toBeGreaterThan(0);
        expect(CompareVersions('2.0', '2.0.1')).toBeLessThan(0);
    });
});

describe('AppUpdate', () => {

    it('Should register the Check channel', () => {
        const fixture = new TestFixture();
        const testee = fixture.CreateTestee();
        expect(testee).toBeDefined();
        expect(fixture.mockIPC.Listen).toHaveBeenCalledWith(Channels.App.Check, expect.any(Function));
    });

    it('Should return the update when the latest release is newer', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true,
            json: async () => ({ tag_name: '2.0.0', html_url: 'https://github.com/Endymi0n74/ChainsmokerNeko/releases/tag/2.0.0', body: 'notes' }),
        })));
        const fixture = new TestFixture();
        fixture.CreateTestee();

        await expect(fixture.GetHandler()()).resolves.toEqual({
            version: '2.0.0',
            url: 'https://github.com/Endymi0n74/ChainsmokerNeko/releases/tag/2.0.0',
            notes: 'notes',
        });
    });

    it('Should return null when the latest release is not newer', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true,
            json: async () => ({ tag_name: '0.1.10', html_url: 'https://example.org', body: '' }),
        })));
        const fixture = new TestFixture();
        fixture.CreateTestee();

        await expect(fixture.GetHandler()()).resolves.toBeNull();
    });

    it('Should return null on a non-OK response', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })));
        const fixture = new TestFixture();
        fixture.CreateTestee();

        await expect(fixture.GetHandler()()).resolves.toBeNull();
    });

    it('Should return null on network failure', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
        const fixture = new TestFixture();
        fixture.CreateTestee();

        await expect(fixture.GetHandler()()).resolves.toBeNull();
    });

    it('Should query the update service at most once per hour', async () => {
        vi.useFakeTimers();
        const fetchMock = vi.fn(async () => ({
            ok: true,
            json: async () => ({ tag_name: '2.0.0', html_url: 'https://example.org', body: '' }),
        }));
        vi.stubGlobal('fetch', fetchMock);
        const fixture = new TestFixture();
        fixture.CreateTestee();
        const handler = fixture.GetHandler();

        await expect(handler()).resolves.toMatchObject({ version: '2.0.0' });
        await expect(handler()).resolves.toMatchObject({ version: '2.0.0' });
        expect(fetchMock, 'every trigger inside the hour shares the single request').toHaveBeenCalledTimes(1);

        vi.setSystemTime(Date.now() + UPDATE_CHECK_INTERVAL_MS - 1_000);
        await expect(handler()).resolves.toMatchObject({ version: '2.0.0' });
        expect(fetchMock, 'still inside the hourly window').toHaveBeenCalledTimes(1);

        vi.setSystemTime(Date.now() + 2_000);
        await expect(handler()).resolves.toMatchObject({ version: '2.0.0' });
        expect(fetchMock, 'the window has elapsed, the service is queried again').toHaveBeenCalledTimes(2);
    });

    it('Should let a failed attempt consume the hourly budget instead of inviting a retry storm', async () => {
        vi.useFakeTimers();
        const fetchMock = vi.fn(async () => { throw new Error('offline'); });
        vi.stubGlobal('fetch', fetchMock);
        const fixture = new TestFixture();
        fixture.CreateTestee();
        const handler = fixture.GetHandler();

        await expect(handler()).resolves.toBeNull();
        await expect(handler()).resolves.toBeNull();
        expect(fetchMock, 'a failing service is not hammered').toHaveBeenCalledTimes(1);

        vi.setSystemTime(Date.now() + UPDATE_CHECK_INTERVAL_MS + 1_000);
        await expect(handler()).resolves.toBeNull();
        expect(fetchMock, 'the next attempt is allowed once the hour has elapsed').toHaveBeenCalledTimes(2);
    });

    it('Should serve concurrent callers from one single in-flight request', async () => {
        const fetchMock = vi.fn(async () => ({
            ok: true,
            json: async () => ({ tag_name: '2.0.0', html_url: 'https://example.org', body: '' }),
        }));
        vi.stubGlobal('fetch', fetchMock);
        const fixture = new TestFixture();
        fixture.CreateTestee();
        const handler = fixture.GetHandler();

        const [first, second] = await Promise.all([handler(), handler()]);
        expect(first).toEqual(second);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('Should check the fork even when the manifest points to another repository', async () => {
        await fs.writeFile(path.join(userDataDir, 'package.json'), JSON.stringify({ repository: 'manga-download/haruneko' }), 'utf-8');
        const fetchMock = vi.fn(async () => ({
            ok: true,
            json: async () => ({ tag_name: '2.0.0', html_url: 'https://github.com/Endymi0n74/ChainsmokerNeko/releases/tag/2.0.0', body: '' }),
        }));
        vi.stubGlobal('fetch', fetchMock);
        const fixture = new TestFixture();
        fixture.CreateTestee();

        await expect(fixture.GetHandler()()).resolves.toMatchObject({ version: '2.0.0' });
        expect(fetchMock).toHaveBeenCalledWith(
            'https://api.github.com/repos/Endymi0n74/ChainsmokerNeko/releases/latest',
            expect.anything(),
        );
    });

    it('Should check the fork when the manifest carries no repository', async () => {
        await fs.writeFile(path.join(userDataDir, 'package.json'), JSON.stringify({}), 'utf-8');
        const fetchMock = vi.fn(async () => ({ ok: false, json: async () => ({}) }));
        vi.stubGlobal('fetch', fetchMock);
        const fixture = new TestFixture();
        fixture.CreateTestee();

        await expect(fixture.GetHandler()()).resolves.toBeNull();
        expect(fetchMock).toHaveBeenCalledWith(
            'https://api.github.com/repos/Endymi0n74/ChainsmokerNeko/releases/latest',
            expect.anything(),
        );
    });

    it('Should download the archive from the fork whatever the manifest says', async () => {
        await fs.writeFile(path.join(userDataDir, 'package.json'), JSON.stringify({ repository: 'manga-download/haruneko' }), 'utf-8');
        const fetchMock = vi.fn(async () => ({ ok: false, status: 404 }));
        vi.stubGlobal('fetch', fetchMock);
        const fixture = new TestFixture();
        fixture.CreateTestee();

        await expect(fixture.GetDownloadHandler()('2.0.0')).resolves.toBe('Error: download failed (404)');
        const platformMap: Record<string, string> = { win32: 'win32-x64', darwin: 'darwin-x64', linux: 'linux-x64' };
        const platform = platformMap[process.platform];
        expect(fetchMock).toHaveBeenCalledWith(
            `https://github.com/Endymi0n74/ChainsmokerNeko/releases/download/2.0.0/ChainsmokerNeko-v2.0.0-${platform}.zip`,
            expect.anything(),
        );
    });
});
