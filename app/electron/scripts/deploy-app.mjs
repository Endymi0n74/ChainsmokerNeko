import path from 'node:path';
import fs from 'node:fs/promises';
import { download, run } from '../../tools.mjs';

const pkgFile = 'package.json';
const pkgConfig = JSON.parse(await fs.readFile(pkgFile));
const dirRes = path.join('..', 'res');
const dirApp = path.join('.', 'build');
const dirOut = path.join('.', 'bundle');
const dirTmp = path.join('.', '.tmp');

const electronVersion = pkgConfig.devDependencies.electron;

async function redist(electronVersion, electronPlatform, electronArchitecture) {
    // The downloaded archive keeps the official Electron release name (required for the
    // download URL and the shared cache), while the extracted directory carries the app's
    // own name and version — the bundle artifacts derive their filenames from that directory.
    const archive = `electron-v${electronVersion}-${electronPlatform}-${electronArchitecture}.zip`;
    const sourceFile = `https://github.com/electron/electron/releases/download/v${electronVersion}/${archive}`;
    // Allow caching the downloaded archives in a dedicated directory (e.g. CI cache),
    // falling back to the project-local `.tmp/electron-zips` (kept on the repo drive,
    // not the OS temp on C:) when unset.
    const dirCache = process.env.HAKUNEKO_ELECTRON_CACHE ? path.resolve(process.env.HAKUNEKO_ELECTRON_CACHE) : path.resolve(dirTmp, 'electron-zips');
    await fs.mkdir(dirCache, { recursive: true });
    const tmpFile = path.resolve(dirCache, archive);
    const electronDir = path.resolve(dirTmp, `${pkgConfig.name}-v${pkgConfig.version}-${electronPlatform}-${electronArchitecture}`);
    
    try {
        await fs.access(tmpFile);
    } catch {
        console.log('Downloading:', sourceFile);
        await download(sourceFile, tmpFile);
    }
    
    await fs.rm(electronDir, { force: true, recursive: true });
    await fs.mkdir(electronDir, { recursive: true });
    
    if (process.platform === 'win32') {
        // PowerShell natif au lieu de extract-zip (bug EACCES Windows)
        await run(`powershell -Command "Expand-Archive -Path '${tmpFile}' -DestinationPath '${electronDir}' -Force"`);
    } else {
        // macOS/Linux : extract-zip (pas de PowerShell sur les runners CI).
        // Import lazy : sur Windows le module n'existe pas (le job CI bundles
        // réutilise l'artefact sans npm ci) et PowerShell est utilisé à la place.
        const { default: extract } = await import('extract-zip');
        await extract(tmpFile, { dir: electronDir });
    }
    
    return electronDir;
}

await fs.mkdir(dirOut, { recursive: true });
await fs.mkdir(dirTmp, { recursive: true });

if (process.platform === 'win32') {
    const portable = await import('./bundle-app-zip.mjs');
    
    for (const arch of ['ia32', 'x64', 'arm64']) {
        const dirTemp = await redist(electronVersion, process.platform, arch);
        await portable.bundle(dirApp, dirRes, dirTemp, dirOut);
    }
}

if (process.platform === 'darwin') {
    const bundler = await import('./bundle-app-dmg.mjs');
    let dirTemp = await redist(electronVersion, process.platform, 'x64');
    await bundler.bundle(dirApp, dirRes, dirTemp, dirOut);
    dirTemp = await redist(electronVersion, process.platform, 'arm64');
    await bundler.bundle(dirApp, dirRes, dirTemp, dirOut);
}

if (process.platform === 'linux') {
    const appimage = await import('./bundle-app-appimage.mjs');
    let dirTemp = await redist(electronVersion, process.platform, 'x64');
    await appimage.bundle(dirApp, dirRes, dirTemp, dirOut);
}