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

let localServer: http.Server | null = null;

async function startLocalServer(webRoot: string): Promise<string> {
    return new Promise((resolve, reject) => {
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

        server.listen(0, '127.0.0.1', () => {
            const addr = server.address();
            if (addr && typeof addr === 'object') {
                const url = `http://127.0.0.1:${addr.port}`;
                console.log(`[LocalServer] ${webRoot} → ${url}`);
                localServer = server;
                resolve(url);
            }
        });
        server.on('error', reject);
    });
}

async function OpenWindow(): Promise<void> {
    try {
        InitializeMenu();
        const argv = ParseCLI();
        const manifest = await LoadManifest();
        await SetupUserDataDirectory(manifest);
        app.userAgentFallback = manifest['user-agent'] ?? app.userAgentFallback.split(/\s+/).filter(segment => !/(hakuneko|electron)/i.test(segment)).join(' ');
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
        new BloatGuard(ipc, win.webContents);
        win.RegisterChannels(ipc);
        await win.loadURL(uri.href).catch(error => console.warn(error));
    } catch(error) {
        console.error(error);
        app.quit();
    }
}

OpenWindow();