import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { app } from 'electron';
import type { IPC } from './InterProcessCommunication';
import { AppUpdate, CompareVersions, type IUpdateInfo } from './AppUpdate';
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

    it('Should return null when no repository is configured', async () => {
        await fs.writeFile(path.join(userDataDir, 'package.json'), JSON.stringify({}), 'utf-8');
        const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ tag_name: '2.0.0' }) }));
        vi.stubGlobal('fetch', fetchMock);
        const fixture = new TestFixture();
        fixture.CreateTestee();

        await expect(fixture.GetHandler()()).resolves.toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
