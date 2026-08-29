import path from 'node:path';
import fs from 'node:fs/promises';
import { purge, run } from '../../tools.mjs';

const dirBuild = path.resolve('build');
const dirWebBuild = path.resolve('..', '..', 'web', 'build');
const pkgFile = 'package.json';
const pkgConfig = JSON.parse(await fs.readFile(pkgFile));
const targetFile = path.resolve(dirBuild, pkgFile);
let targetConfig = {};
try {
    targetConfig = JSON.parse(await fs.readFile(targetFile));
} catch { /* IGNORE */ }

const nmDir=path.resolve(dirBuild,"node_modules");let hasNm=false;try{await fs.access(nmDir);hasNm=true;await fs.rename(nmDir,path.resolve(".tmp","saved_node_modules"));}catch{}
await purge(dirBuild);
if(hasNm){try{await fs.rename(path.resolve(".tmp","saved_node_modules"),nmDir);}catch{}}

// Copie le build web local
const dirWebTarget = path.resolve(dirBuild, 'web');
try {
    await fs.access(dirWebBuild);
    await fs.cp(dirWebBuild, dirWebTarget, { recursive: true });
    console.log('[build-app] Web build copié');
} catch {
    console.warn('[build-app] ⚠️ Web build NON TROUVÉ :', dirWebBuild);
    console.warn('[build-app] → Lance d\'abord : npm run build --workspace=web');
    process.exit(1);
}

const manifest = {
    name: pkgConfig.name,
    version: pkgConfig.version,
    main: pkgConfig.main,
    url: './web/index.html',
    'node-remote': [
        'http://localhost/*',
        'https://localhost/*',
        'https://app.hakuneko.ovh/*',
        'https://app.hakuneko.download/*',
        'https://*.hakuneko.workers.dev/*',
        `${new URL(pkgConfig.url).origin}/*`,
    ],
    'user-data-dir': null,
    'user-agent': targetConfig['user-agent'] ?? null,
    'repository': pkgConfig.repository ?? null,
    dependencies: pkgConfig.dependencies
};
// npm 11+ requires allowScripts keys to match dependency names exactly.
if (manifest.dependencies) {
    manifest.allowScripts = {};
    for (const [name, spec] of Object.entries(manifest.dependencies)) {
        manifest.allowScripts[name] = true;
    }
}

await fs.writeFile(targetFile, JSON.stringify(manifest, null, 4));
try{await fs.access(path.resolve(dirBuild,"node_modules"));console.log("[build-app] node_modules exists, skipping install");}catch{await run("npm install --omit=dev", dirBuild);}