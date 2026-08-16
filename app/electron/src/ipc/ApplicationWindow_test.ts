import { vi, describe, it, expect } from 'vitest';
import { app } from 'electron';
import type { IPC, Callback } from './InterProcessCommunication';
import { ApplicationWindow as Channels } from '../../../src/ipc/Channels';
import { ApplicationWindow } from './ApplicationWindow';

vi.mock('electron', () => {
    return {
        app: {
            getVersion: vi.fn(() => '0.1.0'),
        },
        BrowserWindow: class {
            public show() { /* mock */ }
            public hide() { /* mock */ }
            public minimize() { /* mock */ }
            public maximize() { /* mock */ }
            public restore() { /* mock */ }
            public close() { /* mock */ }
            public isMinimized() { return false; }
            public isMaximized() { return false; }
            public unmaximize() { /* mock */ }
            public removeMenu() { /* mock */ }
            public setMenu() { /* mock */ }
            public setMenuBarVisibility() { /* mock */ }
            public loadURL() { return Promise.resolve(); }
            public on() { /* mock */ }
        },
    };
});

class TestFixture {

    public readonly mockIPC = {
        Listen: vi.fn(),
    } as unknown as IPC<never, never>;

    public CreatTestee(): ApplicationWindow {
        return new ApplicationWindow({} as never);
    }
}

describe('ApplicationWindow', () => {

    describe('RegisterChannels', () => {

        it('Should register the GetVersion channel', () => {
            const fixture = new TestFixture();
            const testee = fixture.CreatTestee();
            testee.RegisterChannels(fixture.mockIPC);
            expect(fixture.mockIPC.Listen).toHaveBeenCalledWith(Channels.App.GetVersion, expect.anything());
        });

        it('GetVersion should resolve to the app version from the manifest', async () => {
            const fixture = new TestFixture();
            const testee = fixture.CreatTestee();
            testee.RegisterChannels(fixture.mockIPC);

            const call = vi.mocked(fixture.mockIPC.Listen).mock.calls.find(([channel]) => channel === Channels.App.GetVersion);
            expect(call).toBeDefined();
            const callback = call![1] as Callback<string>;

            await expect(callback()).resolves.toBe('0.1.0');
            expect(app.getVersion).toHaveBeenCalled();
        });
    });
});
