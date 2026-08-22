import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Bump the release version atomically across every versioned manifest and the
 * changelog, so the manifests can never drift apart (the CI guardrail becomes
 * a safety net instead of the only defense).
 *
 * Usage:
 *   node scripts/bump-version.mjs 2.0.5
 *   node scripts/bump-version.mjs 2.0.5 --dry-run
 *
 * Every validation (semver format, manifest alignment, changelog entry
 * uniqueness) happens BEFORE any file is written — nothing is touched if any
 * check fails. The package.json files are edited in place (raw text replace),
 * so their formatting and line endings are preserved.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const versionArg = args.find(arg => !arg.startsWith('--'));

if(!versionArg) {
    console.error('Usage: node scripts/bump-version.mjs <version> [--dry-run]');
    process.exit(1);
}

const version = versionArg.replace(/^v/, '');
const semverPattern = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;
if(!semverPattern.test(version)) {
    console.error(`Invalid version '${versionArg}': expected a semver like 2.0.5.`);
    process.exit(1);
}

// --- Validate the manifests before touching anything -----------------------

const manifestPaths = [
    'package.json',
    'web/package.json',
    'app/electron/package.json',
    'app/electron/build/package.json',
];

const manifests = manifestPaths.map(manifestPath => {
    const file = path.join(root, manifestPath);
    const raw = fs.readFileSync(file, 'utf8');
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch {
        console.error(`Invalid JSON in ${manifestPath}`);
        process.exit(1);
    }
    return { manifestPath, file, raw, version: parsed.version };
});

const current = manifests[0].version;
if(typeof current !== 'string' || current.length === 0) {
    console.error('Missing "version" field in one of the manifests.');
    process.exit(1);
}

const mismatched = manifests.filter(manifest => manifest.version !== current);
if(mismatched.length > 0) {
    console.error('Manifests are NOT aligned — bump refused. Current versions:');
    for(const manifest of manifests) {
        console.error(`- ${manifest.manifestPath}: ${manifest.version}`);
    }
    process.exit(1);
}

if(version === current) {
    console.error(`Version ${version} is already the current version — nothing to do.`);
    process.exit(1);
}

for(const manifest of manifests) {
    if(manifest.raw.replace(`"version": "${current}"`, `"version": "${version}"`) === manifest.raw) {
        console.error(`Unexpected layout in ${manifest.manifestPath}: version string not found.`);
        process.exit(1);
    }
}

// --- Validate the changelog before touching anything -----------------------

const changelogFile = path.join(root, 'CHANGELOG.md');
let changelog;
try {
    changelog = fs.readFileSync(changelogFile, 'utf8');
} catch {
    console.error('CHANGELOG.md not found.');
    process.exit(1);
}

if(changelog.includes(`## [${version}]`)) {
    console.error(`CHANGELOG.md already contains an entry for [${version}].`);
    process.exit(1);
}

const now = new Date();
const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

const eol = changelog.includes('\r\n') ? '\r\n' : '\n';
const lines = changelog.split(/\r?\n/);
const insertAt = lines.findIndex(line => line.startsWith('## ['));
if(insertAt === -1) {
    console.error('CHANGELOG.md: no version section found — cannot insert the new entry.');
    process.exit(1);
}
const newSection = [
    `## [${version}] - ${date}`,
    '',
    '### Ajouté',
    '',
    '- _À compléter._',
    '',
].join(eol);
lines.splice(insertAt, 0, newSection);
const newChangelog = lines.join(eol);

// --- Apply (or report) ------------------------------------------------------

if(dryRun) {
    for(const manifest of manifests) {
        console.log(`[dry-run] ${manifest.manifestPath}: ${current} -> ${version}`);
    }
    console.log(`[dry-run] CHANGELOG.md: entry [${version}] - ${date} would be added.`);
    console.log(`[dry-run] No file was modified.`);
    process.exit(0);
}

for(const manifest of manifests) {
    const updated = manifest.raw.replace(`"version": "${current}"`, `"version": "${version}"`);
    fs.writeFileSync(manifest.file, updated);
    console.log(`${manifest.manifestPath}: ${current} -> ${version}`);
}
fs.writeFileSync(changelogFile, newChangelog);
console.log(`CHANGELOG.md: entry [${version}] - ${date} added.`);
console.log(`Version bumped to ${version} — fill the changelog entry, review, then commit.`);
