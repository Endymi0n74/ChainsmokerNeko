import type { IPC } from '../InterProcessCommunication';
import { Observable, type IObservable } from '../../Observable';
import type { IAppWindow, IUpdateInfo } from '../AppWindow';
import { ApplicationWindow as Channels, CloudFlareImport as CloudFlareChannels, AppUpdate as AppUpdateChannels } from '../../../../../app/src/ipc/Channels';

export default class implements IAppWindow {

    constructor(private readonly ipc: IPC<string, string>, private readonly splashURL: string) {
        // TODO: Confirm really want to close => window.on('beforunload', ...)

        // TODO: Provisional fullscreen detection needs to be improved (e.g., via IPC BrowserWindow.on('move')) ...
        setInterval(this.#DetectMaximized.bind(this), 250);
    }

    public async ShowSplash(): Promise<void> {
        await this.ipc.Send(Channels.App.HideWindow);
        await this.ipc.Send(Channels.App.OpenSplash, this.splashURL);
    }

    public async HideSplash(): Promise<void> {
        await this.ipc.Send(Channels.App.CloseSplash, this.splashURL);
        await this.ipc.Send(Channels.App.ShowWindow);
    }

    public get HasControls() {
        return true;
    }

    readonly #maximized = new Observable<boolean, IAppWindow>(null, this);
    public get Maximized(): IObservable<boolean, IAppWindow> {
        return this.#maximized;
    }

    #DetectMaximized() {
        const screen = window.screen as Screen & { availLeft?: number, availTop?: number };
        this.#maximized.Value =
            window.screenX === screen.availLeft
            && window.screenY === screen.availTop
            && window.outerWidth === screen.availWidth
            && window.outerHeight === screen.availHeight;
    }

    public Minimize(): void {
        this.ipc.Send(Channels.App.Minimize);
    }

    public Maximize(): void {
        this.ipc.Send(Channels.App.Maximize);
    }

    public Restore(): void {
        this.ipc.Send(Channels.App.Restore);
    }

    public Close(): void {
        this.ipc.Send(Channels.App.Close);
    }

    public async GetVersion(): Promise<string> {
        try {
            return await this.ipc.Send<string>(Channels.App.GetVersion);
        } catch {
            return '';
        }
    }

    public async ImportCloudFlareClearance(host: string): Promise<string> {
        try {
            return await this.ipc.Send<string>(CloudFlareChannels.App.ImportFromBrowser, host);
        } catch (error) {
            return 'Import failed: ' + String(error);
        }
    }

    public async SetCloudFlareClearance(host: string, value: string): Promise<string> {
        try {
            return await this.ipc.Send<string>(CloudFlareChannels.App.SetClearance, host, value);
        } catch (error) {
            return 'Injection failed: ' + String(error);
        }
    }

    public async TestCloudFlareClearance(host: string): Promise<string> {
        try {
            return await this.ipc.Send<string>(CloudFlareChannels.App.TestClearance, host);
        } catch (error) {
            return 'Test failed: ' + String(error);
        }
    }

    public async ClearCloudFlareCache(): Promise<string> {
        try {
            return await this.ipc.Send<string>(CloudFlareChannels.App.ClearCache);
        } catch (error) {
            return 'Failed to clear the Cloudflare cache: ' + String(error);
        }
    }

    public async CheckForUpdates(): Promise<IUpdateInfo | null> {
        try {
            return await this.ipc.Send<IUpdateInfo | null>(AppUpdateChannels.App.Check);
        } catch {
            return null;
        }
    }

    public async DownloadAndInstall(version: string): Promise<string> {
        try {
            return await this.ipc.Send<string>(AppUpdateChannels.App.DownloadAndInstall, version);
        } catch (error) {
            return 'Update failed: ' + String(error);
        }
    }
}