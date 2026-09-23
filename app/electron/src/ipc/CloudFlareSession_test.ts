import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { app, session } from 'electron';
import { CloudFlareSession } from './CloudFlareSession';

vi.mock('electron', () => ({
    app: {
        getPath: vi.fn(() => '/tmp/hakuneko-userdata'),
    },
    session: {
        defaultSession: {
            cookies: {
                get: vi.fn(async () => []),
                set: vi.fn(async () => { /* mock */ }),
                remove: vi.fn(async () => { /* mock */ }),
                on: vi.fn(),
            },
        },
    },
}));

const cookies = session.defaultSession.cookies;
let userDataDir: string;

beforeEach(async () => {
    userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hakuneko-cf-session-'));
    vi.mocked(app.getPath).mockReturnValue(userDataDir);
    vi.mocked(cookies.get).mockReset().mockResolvedValue([]);
    vi.mocked(cookies.set).mockReset().mockResolvedValue();
    vi.mocked(cookies.remove).mockReset().mockResolvedValue();
    vi.mocked(cookies.on).mockReset();
});

afterEach(async () => {
    await fs.rm(userDataDir, { recursive: true, force: true });
});

describe('CloudFlareSession', () => {

    describe('Save', () => {

        it('Should persist every cf_clearance cookie to the snapshot file', async () => {
            // `cookies.get({ name: 'cf_clearance' })` is already filtered by Electron;
            // the mock returns what a real session would for that filter.
            vi.mocked(cookies.get).mockResolvedValue([
                { name: 'cf_clearance', value: 'abc', domain: '.crunchyscan.org', path: '/', secure: true, httpOnly: true, sameSite: 'no_restriction' },
                { name: 'cf_clearance', value: 'def', domain: '.mangafire.to', path: '/', secure: false, httpOnly: false, sameSite: 'lax' },
            ]);

            await CloudFlareSession.Save();

            expect(vi.mocked(cookies.get)).toHaveBeenCalledWith({ name: 'cf_clearance' });
            const snapshot = JSON.parse(await fs.readFile(path.join(userDataDir, 'cloudflare-clearance.json'), 'utf-8'));
            expect(snapshot.version).toBe(1);
            expect(snapshot.cookies).toHaveLength(2);
            expect(snapshot.cookies[0]).toMatchObject({ domain: '.crunchyscan.org', value: 'abc', sameSite: 'no_restriction' });
            expect(snapshot.cookies[1]).toMatchObject({ domain: '.mangafire.to', value: 'def', sameSite: 'lax' });
        });

        it('Should write an empty list when no cf_clearance is present', async () => {
            vi.mocked(cookies.get).mockResolvedValue([]);

            await CloudFlareSession.Save();

            const snapshot = JSON.parse(await fs.readFile(path.join(userDataDir, 'cloudflare-clearance.json'), 'utf-8'));
            expect(snapshot.cookies).toEqual([]);
        });
    });

    describe('Restore', () => {

        it('Should re-inject persisted cookies with a fresh future expiry', async () => {
            await fs.writeFile(path.join(userDataDir, 'cloudflare-clearance.json'), JSON.stringify({
                version: 1,
                savedAt: 1,
                cookies: [
                    { domain: '.crunchyscan.org', value: 'abc', path: '/', secure: true, httpOnly: true, sameSite: 'no_restriction' },
                ],
            }), 'utf-8');

            await CloudFlareSession.Restore();

            const set = vi.mocked(cookies.set);
            expect(set).toHaveBeenCalledTimes(1);
            expect(set).toHaveBeenCalledWith(expect.objectContaining({
                url: 'https://crunchyscan.org/',
                name: 'cf_clearance',
                value: 'abc',
                domain: '.crunchyscan.org',
                expirationDate: expect.any(Number),
            }));
            const details = set.mock.calls[0][0] as { expirationDate: number };
            expect(details.expirationDate).toBeGreaterThan(Math.round(Date.now() / 1000));
        });

        it('Should do nothing when no snapshot exists', async () => {
            await CloudFlareSession.Restore();

            expect(vi.mocked(cookies.set)).not.toHaveBeenCalled();
        });

        it('Should skip malformed entries instead of throwing', async () => {
            await fs.writeFile(path.join(userDataDir, 'cloudflare-clearance.json'), JSON.stringify({
                version: 1,
                savedAt: 1,
                cookies: [null, {}, { domain: '.crunchyscan.org', value: 'abc', path: '/', secure: true, httpOnly: true, sameSite: 'no_restriction' }],
            }), 'utf-8');

            await CloudFlareSession.Restore();

            expect(vi.mocked(cookies.set)).toHaveBeenCalledTimes(1);
        });
    });

    describe('Clear', () => {

        it('Should remove every cf_clearance cookie and delete the snapshot', async () => {
            vi.mocked(cookies.get).mockResolvedValue([
                { name: 'cf_clearance', value: 'abc', domain: '.crunchyscan.org', path: '/', secure: true, httpOnly: true, sameSite: 'no_restriction' },
                { name: 'cf_clearance', value: 'def', domain: '.mangafire.to', path: '/', secure: true, httpOnly: true, sameSite: 'no_restriction' },
            ]);
            await fs.writeFile(path.join(userDataDir, 'cloudflare-clearance.json'), JSON.stringify({ version: 1, savedAt: 1, cookies: [] }), 'utf-8');

            const status = await CloudFlareSession.Clear();

            const remove = vi.mocked(cookies.remove);
            expect(remove).toHaveBeenCalledTimes(2);
            expect(remove).toHaveBeenCalledWith('https://crunchyscan.org/', 'cf_clearance');
            expect(remove).toHaveBeenCalledWith('https://mangafire.to/', 'cf_clearance');
            await expect(fs.access(path.join(userDataDir, 'cloudflare-clearance.json'))).rejects.toThrow();
            expect(status).toContain('2 cf_clearance cookies');
            expect(status).toContain('persisted snapshot');
        });

        it('Should report when there is nothing to clear', async () => {
            vi.mocked(cookies.get).mockResolvedValue([]);

            const status = await CloudFlareSession.Clear();

            expect(vi.mocked(cookies.remove)).not.toHaveBeenCalled();
            expect(status).toBe('No Cloudflare clearance cache to clear.');
        });
    });

    describe('Install', () => {

        it('Should restore at boot and snapshot whenever a cf_clearance changes', async () => {
            vi.useFakeTimers();
            try {
                await CloudFlareSession.Install();

                const on = vi.mocked(cookies.on);
                expect(on).toHaveBeenCalledWith('changed', expect.any(Function));
                const handler = on.mock.calls.find(call => call[0] === 'changed')?.[1];
                expect(handler).toBeDefined();

                vi.mocked(cookies.get).mockClear();
                await handler?.({} as Event, { name: 'cf_clearance', value: 'abc', domain: '.crunchyscan.org', path: '/', secure: true, httpOnly: true, sameSite: 'no_restriction' }, 'inserted', false);
                await handler?.({} as Event, { name: 'session', value: 'x', domain: '.crunchyscan.org', path: '/', secure: true, httpOnly: true, sameSite: 'no_restriction' }, 'inserted', false);

                vi.advanceTimersByTime(1100);
                await vi.runAllTimersAsync();

                // Only the cf_clearance change triggers a snapshot (session cookie is ignored).
                expect(vi.mocked(cookies.get)).toHaveBeenCalledTimes(1);
                expect(vi.mocked(cookies.get)).toHaveBeenCalledWith({ name: 'cf_clearance' });
            } finally {
                vi.useRealTimers();
            }
        });
    });
});
