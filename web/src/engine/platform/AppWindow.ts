import { Runtime } from './PlatformInfo';
import { PlatformInstanceActivator } from './PlatformInstanceActivator';
import NodeWebkitAppWindow from './nw/AppWindow';
import ElectronAppWindow from './electron/AppWindow';
import { GetLocale } from '../../i18n/Localization';
import GetIPC from './InterProcessCommunication';
import type { IObservable } from '../Observable';

export interface IAppWindow {
    /**
     * Hide the application window and show the loading splash screen.
     */
    ShowSplash(): Promise<void>;
    /**
     * Show the application window and hide the loading splash screen.
     */
    HideSplash(): Promise<void>;
    readonly HasControls: boolean;
    readonly Maximized: IObservable<boolean, IAppWindow>;
    Minimize(): void;
    Maximize(): void;
    Restore(): void;
    Close(): void;
    /**
     * Get the application version (e.g. `0.1.0`), or an empty string when unavailable.
     */
    GetVersion(): Promise<string>;
    /**
     * Import the `cf_clearance` cookie for the given host from the user's real browser
     * (Edge/Chrome) into the app session. Returns a human-readable status message.
     */
    ImportCloudFlareClearance(host: string): Promise<string>;
    /**
     * Inject a manually provided `cf_clearance` value for the given host into the app session.
     * Returns a human-readable status message.
     */
    SetCloudFlareClearance(host: string, value: string): Promise<string>;
    /**
     * Verify whether the `cf_clearance` cookie currently in the app session actually
     * unblocks the given host. Returns a human-readable status message.
     */
    TestCloudFlareClearance(host: string): Promise<string>;
}

export function CreateAppWindow(splashURL: string): IAppWindow {
    return new PlatformInstanceActivator<IAppWindow>()
        .Configure(Runtime.NodeWebkit, () => new NodeWebkitAppWindow(nw.Window.get(), splashURL))
        .Configure(Runtime.Electron, () => new ElectronAppWindow(GetIPC(), splashURL))
        .Create();
}

export function ReloadAppWindow(force = false): void {
    if(force || confirm(GetLocale().FrontendController_Reload_ConfirmNotice())) {
        window.location.reload();
    }
}