import type { IObservable } from '../Observable';
import { Exception } from '../Error';
import { EngineResourceKey as R } from '../../i18n/ILocale';
import { PlatformInfo, Runtime } from './PlatformInfo';
import { PlatformInstanceActivator } from './PlatformInstanceActivator';
import NodeWebkitRemoteBrowserWindow from './nw/RemoteBrowserWindow';
import ElectronRemoteBrowserWindow from './electron/RemoteBrowserWindow';
import GetIPC from './InterProcessCommunication';

export interface IRemoteBrowserWindow {
    get DOMReady(): IObservable<void, IRemoteBrowserWindow>;
    get BeforeWindowNavigate(): IObservable<URL, IRemoteBrowserWindow>;
    get BeforeFrameNavigate(): IObservable<URL, IRemoteBrowserWindow>;
    Open(request: Request, show: boolean, preload: string): Promise<void>;
    Close(): Promise<void>;
    Show(): Promise<void>;
    Hide(): Promise<void>;
    /**
     * Evaluate the given {@link script} and return the result from the last instruction.
     */
    ExecuteScript<T extends void | JSONElement>(script: string): Promise<T>;
    /**
     * Send chrome debug protocol commands.
     * @see https://chromedevtools.github.io/devtools-protocol/1-3/
     */
    SendDebugCommand<T extends void | JSONElement>(method: string, parameters?: JSONObject): Promise<T>;
}

export function CreateRemoteBrowserWindow(info: PlatformInfo = new PlatformInfo()): IRemoteBrowserWindow {
    // A remote browser window (used by FetchWindowScript and the like) can only be spawned by a desktop shell
    // (Electron or NW.js). In a plain browser or any other runtime, fail with a user-friendly, localized message
    // instead of the opaque `InternalError` raised by the platform activator below.
    if(info.Runtime !== Runtime.Electron && info.Runtime !== Runtime.NodeWebkit) {
        throw new Exception(R.FetchProvider_FetchWindow_UnsupportedEnvironmentError, info.Runtime);
    }
    return new PlatformInstanceActivator<IRemoteBrowserWindow>(info)
        .Configure(Runtime.NodeWebkit, () => new NodeWebkitRemoteBrowserWindow())
        .Configure(Runtime.Electron, () => new ElectronRemoteBrowserWindow(GetIPC()))
        .Create();
}