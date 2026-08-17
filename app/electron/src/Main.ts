import path from 'path';
import fs from 'fs/promises';
import http from 'http';
import { app } from 'electron';
import { Command } from 'commander';
import { IPC } from './ipc/InterProcessCommunication';
import { ApplicationWindow } from './ipc/ApplicationWindow';
import { FetchProvider } from './ipc/FetchProvider';
import { InitializeMenu } from './Menu';
import { BloatGuard } from './ipc/BloatGuard';
import { RemoteBrowserWindowController } from './ipc/RemoteBrowserWindow';
import { CloudFlareImport } from './ipc/CloudFlareImport';
import { RPCServer } from '../../src/rpc/Server';
import { RemoteProcedureCallManager } from './ipc/RemoteProcedureCallManager';
import { RemoteProcedureCallContract } from './ipc/RemoteProcedureCallContract';

process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';

type CLIOptions = {
    origin?: string;
}

app.commandLine.appendSwitch('allow-running-insecure-content');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

function ParseCLI(): CLIOptions {
    try {
        const argv = new Command()
            .allowUnknownOption(true)
            .allowExcessArguments(true)
            .option('--origin [url]', 'custom location from which the web-app shall be loaded')
            .parse(process.argv, { from: 'electron' });
        return argv.opts();
    } catch {
        return {};
    }
}

type Manifest = {
    url: string;
    'user-agent': undefined | string;
    'user-data-dir': undefined | string;
};

async function LoadManifest(): Promise<Manifest> {
    const file = path.resolve(app.getAppPath(), 'package.json');
    const content = await fs.readFile(path.normalize(file), { encoding: 'utf-8' });
    return JSON.parse(content) as Manifest;
}

async function SetupUserDataDirectory(manifest: Manifest): Promise<void> {
    const userDataDir = manifest['user-data-dir'];
    if (userDataDir) {
        app.setPath('userData', path.isAbsolute(userDataDir) ? userDataDir : path.resolve(path.dirname(app.getPath('exe')), userDataDir));
    }
}

async function CreateApplicationWindow(): Promise<ApplicationWindow> {
    const win = new ApplicationWindow({
        show: false,
        width: 1280,
        height: 800,
        center: true,
        frame: false,
        transparent: true,
        webPreferences: {
            sandbox: false,
            webSecurity: false,
            contextIsolation: true,
            nodeIntegration: false,
            nodeIntegrationInWorker: false,
            nodeIntegrationInSubFrames: false,
            disableBlinkFeatures: 'AutomationControlled',
            preload: path.resolve(app.getAppPath(), 'preload.js'),
        },
    });

    win.setMenuBarVisibility(false);
    win.on('closed', () => app.quit());

    return win;
}

function CheckHostPermission(url: string, appURI: URL) {
    try {
        return new URL(url).hostname === appURI.hostname;
    } catch {
        return false;
    }
}

function UpdatePermissions(session: Electron.Session, appURI: URL) {
    session.setPermissionCheckHandler((webContents, permission, requestingOrigin) => CheckHostPermission(requestingOrigin, appURI));
    session.setPermissionRequestHandler((webContents, permission, callback, details) => callback(CheckHostPermission(details.requestingUrl, appURI)));
    session.on('file-system-access-restricted', (event, details, callback) => callback(CheckHostPermission(details.origin, appURI) ? 'allow' : 'deny'));
}

// FIX: a random port (listen(0)) changes the web-app origin on every launch, which resets
// IndexedDB/localStorage/cookies (settings, bookmarks, cf_clearance) between runs.
// Bind to a stable port so the origin http://127.0.0.1:<port> persists across launches,
// with a small fallback range in case the preferred port is already taken.
const LocalServerPort = 64210;
const LocalServerPortRange = 16;

async function startLocalServer(webRoot: string): Promise<string> {
    const mimeTypes: Record<string, string> = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.mjs': 'application/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json',
        '.webp': 'image/webp',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.woff2': 'font/woff2',
        '.ico': 'image/x-icon',
    };

    const server = http.createServer(async (req, res) => {
        try {
            let reqPath = decodeURIComponent(req.url || '/');
            if (reqPath.includes('..')) {
                res.writeHead(403);
                res.end();
                return;
            }

            let filePath = path.join(webRoot, reqPath);
            const stat = await fs.stat(filePath).catch(() => null);
            if (stat?.isDirectory()) {
                filePath = path.join(filePath, 'index.html');
            }

            const data = await fs.readFile(filePath);
            const ext = path.extname(filePath).toLowerCase();

            res.writeHead(200, {
                'Content-Type': mimeTypes[ext] || 'application/octet-stream',
                'Access-Control-Allow-Origin': '*',
                'Service-Worker-Allowed': '/',
            });
            res.end(data);
        } catch {
            res.writeHead(404);
            res.end();
        }
    });

    for (let attempt = 0; attempt <= LocalServerPortRange; attempt++) {
        const port = attempt < LocalServerPortRange ? LocalServerPort + attempt : 0;
        try {
            const url = await new Promise<string>((resolve, reject) => {
                const onError = (error: NodeJS.ErrnoException) => {
                    server.off('listening', onListening);
                    reject(error);
                };
                const onListening = () => {
                    server.off('error', onError);
                    const addr = server.address();
                    if (addr && typeof addr === 'object') {
                        resolve(`http://127.0.0.1:${addr.port}`);
                    } else {
                        reject(new Error('failed to resolve local server address'));
                    }
                };
                server.once('error', onError);
                server.once('listening', onListening);
                server.listen(port, '127.0.0.1');
            });
            console.log(`[LocalServer] ${webRoot} → ${url}`);
            return url;
        } catch (error) {
            if (attempt >= LocalServerPortRange || (error as NodeJS.ErrnoException).code !== 'EADDRINUSE') {
                throw error;
            }
        }
    }
    throw new Error('unable to start local server');
}

async function OpenWindow(): Promise<void> {
    try {
        InitializeMenu();
        const argv = ParseCLI();
        const manifest = await LoadManifest();
        await SetupUserDataDirectory(manifest);
        // FIX: Cloudflare flags the app's product token (e.g. "hakuneko-electron/43.3.0", inserted by
        // Electron from package.json `name`/`version`) as a bot UA and serves an endless "Just a moment…"
        // managed challenge (probe-verified: the standard Chromium/Electron UA passes instantly).
        // Strip the product token so the default UA is the plain `... Chrome/x Electron/x Safari/x` one.
        const productToken = `${app.getName()}/${app.getVersion()}`;
        app.userAgentFallback = manifest['user-agent']
            ?? app.userAgentFallback.replace(new RegExp(`(^|\\s)${productToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s?`), '$1');
        await app.whenReady();
        const win = await CreateApplicationWindow();

        let rawUrl = argv.origin ?? manifest.url ?? 'about:blank';

        // Si c'est un chemin local (./web/...), lancer un serveur HTTP
        if (!rawUrl.match(/^(https?|file|about):/i)) {
            const webRoot = path.resolve(app.getAppPath(), rawUrl.replace(/\/index\.html$/, '').replace(/^\.\//, ''));
            rawUrl = await startLocalServer(webRoot);
        }

        const uri = new URL(rawUrl);
        UpdatePermissions(win.webContents.session, uri);
        const ipc = new IPC(win.webContents);
        const rpc = new RPCServer('/hakuneko', new RemoteProcedureCallContract(ipc, win.webContents));
        new RemoteProcedureCallManager(rpc, ipc);
        new FetchProvider(ipc, win.webContents);
        new RemoteBrowserWindowController(ipc);
        new CloudFlareImport(ipc);
        new BloatGuard(ipc, win.webContents);
        win.RegisterChannels(ipc);
        await win.loadURL(uri.href).catch(error => console.warn(error));
    } catch(error) {
        console.error(error);
        app.quit();
    }
}

OpenWindow();
