import { vi, describe, it, expect, beforeEach, afterEach, type MockInstance } from 'vitest';
import type { IPC } from '../InterProcessCommunication';
import RemoteBrowserWindow from './RemoteBrowserWindow';
import { RemoteBrowserWindowController as Channels } from '../../../../../app/src/ipc/Channels';

describe('RemoteBrowserWindow (electron)', () => {

    const windowID = 42;
    let listen: ReturnType<typeof vi.fn>;
    let send: ReturnType<typeof vi.fn>;
    let log: MockInstance<typeof console.log>;
    let warn: MockInstance<typeof console.warn>;

    beforeEach(() => {
        listen = vi.fn();
        send = vi.fn((channel: unknown) => channel === Channels.App.OpenWindow ? windowID : undefined);
        log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    const createTestee = (): RemoteBrowserWindow => new RemoteBrowserWindow({ Listen: listen, Send: send } as unknown as IPC<Channels.App, Channels.Web>);

    /** Registered callback of the reader console relay. */
    const relay = (): (id: number, level: string, message: string) => Promise<void> => {
        const registration = listen.mock.calls.find(call => call[0] === Channels.Web.OnConsoleMessage);
        return registration?.[1] as (id: number, level: string, message: string) => Promise<void>;
    };

    it('Should subscribe to the reader window console relay', () => {
        createTestee();

        expect(relay()).toBeTypeOf('function');
        expect(listen).toHaveBeenCalledWith(Channels.Web.OnDomReady, expect.any(Function));
        expect(listen).toHaveBeenCalledWith(Channels.Web.OnBeforeNavigate, expect.any(Function));
    });

    it('Should print the diagnostics relayed from its own reader window', async () => {
        const testee = createTestee();
        await testee.Open(new Request('https://www.japscan.lol/manga/demo/12/'));

        await relay()(windowID, 'info', '[ReaderWindow:42] [info] [JapScan] /manga/demo/12/ -> 42 pages (drm: 42, dom: 0, total: 42)');

        expect(log).toHaveBeenCalledWith('[ReaderWindow:42] [info] [JapScan] /manga/demo/12/ -> 42 pages (drm: 42, dom: 0, total: 42)');
        expect(warn).not.toHaveBeenCalled();
    });

    it('Should preserve the warning level of relayed diagnostics', async () => {
        const testee = createTestee();
        await testee.Open(new Request('https://www.japscan.lol/manga/demo/12/'));

        await relay()(windowID, 'warning', '[ReaderWindow:42] [warning] [KUMO] JapScan overlay detected - waiting for user to solve the puzzle');

        expect(warn).toHaveBeenCalledWith(expect.stringContaining('[KUMO] JapScan overlay detected'));
        expect(log).not.toHaveBeenCalled();
    });

    it('Should ignore diagnostics of a foreign window', async () => {
        const testee = createTestee();
        await testee.Open(new Request('https://www.japscan.lol/manga/demo/12/'));

        await relay()(windowID + 1, 'info', '[ReaderWindow:43] [info] [JapScan] foreign');
        await relay()(Number.NaN, 'warning', '[ReaderWindow:NaN] [warning] [KUMO] foreign');

        expect(log).not.toHaveBeenCalled();
        expect(warn).not.toHaveBeenCalled();
    });
});
