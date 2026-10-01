import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { BrowserWindow, session, type BrowserWindowConstructorOptions } from 'electron';
import type { IPC, Callback } from './InterProcessCommunication';
import { RemoteBrowserWindowController as Channels } from '../../../src/ipc/Channels';

export class RemoteBrowserWindowController {

    /**
     * Windows destroyed through our own `CloseWindow` IPC. A window which disappears without
     * this marker (the user closes it, the renderer crashes, the OS reclaims it) looks exactly
     * like our own close to the web side — it only ever gets `Failed to find window with id N`.
     */
    private readonly closingWindows = new Set<number>();

    constructor (private readonly ipc: IPC<Channels.Web, Channels.App>) {
        this.ipc.Listen(Channels.App.OpenWindow, this.OpenWindow.bind(this) as Callback<number>);
        this.ipc.Listen(Channels.App.CloseWindow, this.CloseWindow.bind(this) as Callback);
        this.ipc.Listen(Channels.App.SetVisibility, this.SetVisibility.bind(this) as Callback);
        this.ipc.Listen(Channels.App.ExecuteScript, this.ExecuteScript.bind(this) as Callback);
        this.ipc.Listen(Channels.App.SendDebugCommand, this.SendDebugCommand.bind(this) as Callback);
        this.ipc.Listen(Channels.App.LoadURL, this.LoadURL.bind(this) as Callback);
    }

    private Throw(message: string): never {
        throw new Error(message);
    }

    private FindWindow(windowID: number): BrowserWindow {
        return BrowserWindow.fromId(windowID) ?? this.Throw(`Failed to find window with id ${windowID}!`);
    }

    private async CreatePreloadScriptFile(content: string): Promise<string> {
        const file = path.resolve(os.tmpdir(), Date.now().toString(36) + Math.random().toString(36));
        await fs.writeFile(file, content);
        return file;
    }

    private async OpenWindow(options: string): Promise<number> {
        const windowOptions: BrowserWindowConstructorOptions = JSON.parse(options);

        // FIX: force same session so challenge cookies are shared with main app
        if (!windowOptions.webPreferences) windowOptions.webPreferences = {};
        windowOptions.webPreferences.session = session.defaultSession;

        if (windowOptions.webPreferences?.preload) {
            windowOptions.webPreferences.preload = await this.CreatePreloadScriptFile(windowOptions.webPreferences.preload);
        } else {
            delete windowOptions.webPreferences?.preload;
        }
        const win = new BrowserWindow(windowOptions);
        win.autoHideMenuBar = true;
        win.setMenuBarVisibility(false);
        win.webContents.debugger.attach('1.3');
        const windowID = win.id;
        // Announce a window which disappears on its own into the app console (F12): the web side
        // only ever reports `Failed to find window with id N`, which cannot say whether the flow
        // closed the window or whether it died under it (a crashed renderer closes the window
        // too, and looks identical from the poller's side).
        win.on('closed', () => {
            if (!this.closingWindows.delete(windowID)) {
                this.ipc.Send(Channels.Web.OnConsoleMessage, windowID, 'warning', `[ReaderWindow:${windowID}] [warning] window closed without CloseWindow (user, crash or OS)`);
            }
        });
        win.webContents.on('render-process-gone', (_event, details) => {
            this.ipc.Send(Channels.Web.OnConsoleMessage, windowID, 'error', `[ReaderWindow:${windowID}] [error] renderer gone: ${details.reason}`);
        });
        win.webContents.setWindowOpenHandler(() => { return { action: 'deny' }; });
        // Route the reader window's in-page console output into the main-process log
        // (captured e.g. via `--enable-logging`) so extraction-script diagnostics are
        // visible without instrumenting the page itself.
        win.webContents.on('console-message', (details) => {
            const level = details.level ?? 'info';
            const frame = details.frame?.url ? ` @ ${details.frame.url}` : '';
            const line = `[ReaderWindow:${win.id}] [${level}] ${details.message} (${details.sourceId}:${details.lineNumber}${frame})`;
            if (level === 'warning' || level === 'error') {
                console.warn(line);
            } else {
                console.log(line);
            }
            // Relay our own extraction diagnostics into the renderer console (F12): the reader
            // window's output is otherwise only readable with `--enable-logging`, which leaves a
            // 300 s reader timeout unexplainable from within the app. Filtered on the `[JapScan]`
            // and `[KUMO]` prefixes so the website's console spam never crosses the IPC — plus
            // every page error, which is rare and exactly what a Cloudflare widget that never
            // mounts looks like (api.js blocked by the network or by CSP, Turnstile failing).
            if (details.message.startsWith('[JapScan]') || details.message.startsWith('[KUMO]') || level === 'error') {
                this.ipc.Send(Channels.Web.OnConsoleMessage, win.id, level, line);
            }
        });
        win.webContents.on('dom-ready', () => this.ipc.Send(Channels.Web.OnDomReady, win.id));
        win.webContents.on('did-start-navigation', event => this.ipc.Send(Channels.Web.OnBeforeNavigate, win.id, event.url, event.isMainFrame, event.isSameDocument));
        win.once('closed', () => windowOptions.webPreferences?.preload && fs.rm(windowOptions.webPreferences?.preload).catch(err => console.warn(err)));
        return win.id;
    }

    private async CloseWindow(windowID: number): Promise<void> {
        const win = BrowserWindow.fromId(windowID);
        if (!win || win.isDestroyed()) return;
        if (win.webContents.debugger.isAttached()) win.webContents.debugger.detach();
        // Mark our own close so the `closed` handler does not report it as an external one.
        this.closingWindows.add(windowID);
        win.destroy();
    }

    private async SetVisibility(windowID: number, show: boolean): Promise<void> {
        const win = BrowserWindow.fromId(windowID);
        if (!win || win.isDestroyed()) return;
        return show ? win.show() : win.hide();
    }

    private async ExecuteScript<T extends JSONElement>(windowID: number, script: string): Promise<T> {
        const win = BrowserWindow.fromId(windowID);
        if (!win || win.isDestroyed()) throw new Error(`Failed to find window with id ${windowID}!`);
        return win.webContents.executeJavaScript(script, true);
    }

    private async SendDebugCommand<T extends void | JSONElement>(windowID: number, method: string, parameters?: JSONObject): Promise<T> {
        const remoteDebugger = this.FindWindow(windowID).webContents.debugger;
        if(remoteDebugger.isAttached()) {
            return remoteDebugger.sendCommand(method, parameters) as Promise<T>;
        } else {
            this.Throw(`The debugger is not attached to the window with id ${windowID}!`);
        }
    }

    private async LoadURL(windowID: number, url: string, options: string): Promise<void> {
        await this.FindWindow(windowID).loadURL(url, JSON.parse(options));
    }
}
