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

await purge(dirBuild);

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

await fs.writeFile(targetFile, JSON.stringify(manifest, null, 4));
await run('npm install --omit=dev', dirBuild);