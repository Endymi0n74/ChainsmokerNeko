import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Guardrail: every versioned package.json in the monorepo must carry the same
 * version before a build or release. A single source of truth prevents
 * releasing bundles whose embedded manifests disagree (the Electron build
 * stamps its own package.json, but the web/root manifests feed the docs and
 * the update notification).
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const manifestPaths = [
    'package.json',
    'web/package.json',
    'app/electron/package.json',
];

const manifests = manifestPaths.map(manifestPath => {
    const file = path.join(root, manifestPath);
    const raw = fs.readFileSync(file, 'utf8');
    let version;
    try {
        ({ version } = JSON.parse(raw));
    } catch {
        throw new Error(`Invalid JSON in ${manifestPath}`);
    }
    if(typeof version !== 'string' || version.length === 0) {
        throw new Error(`Missing "version" field in ${manifestPath}`);
    }
    return { manifestPath, version };
});

const expected = manifests[0].version;
const mismatches = manifests.filter(manifest => manifest.version !== expected);

if(mismatches.length > 0) {
    for(const { manifestPath, version } of manifests) {
        console.error(`- ${manifestPath}: ${version}`);
    }
    console.error(`Version mismatch: expected every manifest to be '${expected}'.`);
    process.exit(1);
}

console.log(`All manifests share version ${expected}.`);
