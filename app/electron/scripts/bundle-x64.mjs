import path from 'node:path';
import fs from 'node:fs/promises';
import { run } from '../../tools.mjs';

/**
 * Single-arch (win32-x64) bundle for quick local testing.
 * Full pipeline: web build -> electron build (web copy + manifest + main/preload) -> x64 zip.
 * Usage: `npm run bundle:x64` (workspace app/electron) or `npm run bundle:x64` (root, runs web first).
 *
 * The full 3-arch + installer pipeline stays `npm run bundle --workspace=app/electron`.
 */

// Git Bash (used on Windows) does not always have npm/node on PATH for spawned
// processes — add the NodeJS install dir so `npm install` inside build-app.mjs works.
if (process.platform === 'win32') {
    const nodeDir = path.dirname(process.execPath);
    if (!process.env.PATH.includes(nodeDir)) {
        process.env.PATH = nodeDir + path.delimiter + process.env.PATH;
    }
}

const pkg = JSON.parse(await fs.readFile('package.json'));
const version = pkg.version;
const arch = 'x64';
const cacheDir = path.resolve('.tmp', 'electron-zips');
const archive = `electron-v${pkg.devDependencies.electron}-win32-${arch}.zip`;
const dirTemp = path.resolve('.tmp', `hakuneko-electron-v${version}-win32-${arch}`);
const dirOut = path.resolve('bundle');
const dirApp = path.resolve('build');
const dirRes = path.resolve('..', 'res');

// 1. Electron app build (web build must exist already — the root script builds it first)
console.log('[bundle:x64] electron build (web copy + manifest + main/preload)…');
await run('node ./scripts/build-app.mjs');
await run(`node ${path.resolve('..', '..', 'node_modules', 'vite', 'bin', 'vite.js')} build`);
console.log('[bundle:x64] electron build done.');

// 2. Single x64 zip from the cached Electron distribution
console.log(`[bundle:x64] bundling win32-${arch}…`);
await fs.rm(dirTemp, { force: true, recursive: true });
await fs.mkdir(dirTemp, { recursive: true });
await run(`powershell -Command "Expand-Archive -Path '${path.join(cacheDir, archive)}' -DestinationPath '${dirTemp}' -Force"`);
const { bundle } = await import('./bundle-app-zip.mjs');
await bundle(dirApp, dirRes, dirTemp, dirOut);
console.log('[bundle:x64] DONE ->', path.join(dirOut, `hakuneko-electron-v${version}-win32-${arch}.zip`));
