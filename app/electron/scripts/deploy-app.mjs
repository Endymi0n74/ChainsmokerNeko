import os from 'node:os';
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
    const base = `electron-v${electronVersion}-${electronPlatform}-${electronArchitecture}`;
    const archive = `${base}.zip`;
    const sourceFile = `https://github.com/electron/electron/releases/download/v${electronVersion}/${archive}`;
    const tmpFile = path.resolve(os.tmpdir(), archive);
    const electronDir = path.resolve(dirTmp, base.replace(/^electron/i, pkgConfig.name));
    
    try {
        await fs.access(tmpFile);
    } catch {
        console.log('Downloading:', sourceFile);
        await download(sourceFile, tmpFile);
    }
    
    await fs.rm(electronDir, { force: true, recursive: true });
    await fs.mkdir(electronDir, { recursive: true });
    
    // PowerShell natif au lieu de extract-zip (bug EACCES Windows)
    await run(`powershell -Command "Expand-Archive -Path '${tmpFile}' -DestinationPath '${electronDir}' -Force"`);
    
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
    const snap = await import('./bundle-app-snap.mjs');
    let dirTemp = await redist(electronVersion, process.platform, 'x64');
    await snap.bundle(dirApp, dirRes, dirTemp, dirOut);
}