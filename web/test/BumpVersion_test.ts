import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const scriptSource = path.join(repoRoot, 'scripts', 'bump-version.mjs');
const eol = '\r\n';

class Sandbox {

    public readonly dir: string;
    public readonly script: string;

    public constructor() {
        this.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bump-version-'));
        const scriptsDir = path.join(this.dir, 'scripts');
        fs.mkdirSync(scriptsDir, { recursive: true });
        fs.mkdirSync(path.join(this.dir, 'web'), { recursive: true });
        fs.mkdirSync(path.join(this.dir, 'app', 'electron'), { recursive: true });
        fs.mkdirSync(path.join(this.dir, 'app', 'electron', 'build'), { recursive: true });
        this.script = path.join(scriptsDir, 'bump-version.mjs');
        fs.copyFileSync(scriptSource, this.script);
        this.WriteManifest('package.json', '2.0.4');
        this.WriteManifest('web/package.json', '2.0.4');
        this.WriteManifest('app/electron/package.json', '2.0.4');
        this.WriteManifest('app/electron/build/package.json', '2.0.4');
        this.WriteChangelog([
            '# Changelog',
            '',
            'Intro.',
            '',
            '## [2.0.4] - 2026-08-18',
            '',
            '### Ajouté',
            '',
            '- Chose.',
            '',
        ]);
    }

    public WriteManifest(relativePath: string, version: string): void {
        const content = '{\n    "version": "' + version + '",\n    "name": "test"\n}\n';
        fs.writeFileSync(path.join(this.dir, relativePath), content.replace(/\n/g, eol));
    }

    public WriteChangelog(lines: string[]): void {
        fs.writeFileSync(path.join(this.dir, 'CHANGELOG.md'), lines.join(eol));
    }

    public ReadVersion(relativePath: string): string {
        return JSON.parse(fs.readFileSync(path.join(this.dir, relativePath), 'utf8')).version;
    }

    public ReadChangelog(): string {
        return fs.readFileSync(path.join(this.dir, 'CHANGELOG.md'), 'utf8');
    }

    public Run(args: string[]): ReturnType<typeof spawnSync> {
        return spawnSync(process.execPath, [ this.script, ...args ], { encoding: 'utf8' });
    }

    public Dispose(): void {
        fs.rmSync(this.dir, { recursive: true, force: true });
    }
}

describe('bump-version.mjs', () => {

    let sandbox: Sandbox;

    beforeEach(() => {
        sandbox = new Sandbox();
    });

    afterEach(() => {
        sandbox.Dispose();
    });

    it('Should bump all manifests and insert a changelog entry', () => {
        const result = sandbox.Run([ '2.0.5' ]);
        expect(result.status).toBe(0);
        expect(sandbox.ReadVersion('package.json')).toBe('2.0.5');
        expect(sandbox.ReadVersion('web/package.json')).toBe('2.0.5');
        expect(sandbox.ReadVersion('app/electron/package.json')).toBe('2.0.5');
        const changelog = sandbox.ReadChangelog();
        expect(changelog).toContain('## [2.0.5] -');
        expect(changelog).toContain('### Ajouté');
        expect(changelog).toContain('_À compléter._');
        expect(changelog.indexOf('## [2.0.5]')).toBeLessThan(changelog.indexOf('## [2.0.4]'));
        expect(changelog.includes('\r\n')).toBe(true);
    });

    it('Should refuse to bump when the manifests are misaligned', () => {
        sandbox.WriteManifest('web/package.json', '2.0.3');
        const result = sandbox.Run([ '2.0.5' ]);
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain('NOT aligned');
        // Nothing was written.
        expect(sandbox.ReadVersion('package.json')).toBe('2.0.4');
        expect(sandbox.ReadVersion('web/package.json')).toBe('2.0.3');
        expect(sandbox.ReadVersion('app/electron/package.json')).toBe('2.0.4');
        expect(sandbox.ReadChangelog()).not.toContain('## [2.0.5]');
    });

    it('Should refuse to bump to the current version', () => {
        const result = sandbox.Run([ '2.0.4' ]);
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain('already the current version');
    });

    it('Should refuse an invalid semver', () => {
        const result = sandbox.Run([ 'banana' ]);
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain('Invalid version');
    });

    it('Should refuse when the changelog already contains the target entry', () => {
        sandbox.WriteChangelog([
            '# Changelog',
            '',
            'Intro.',
            '',
            '## [2.0.5] - 2026-08-18',
            '',
            '## [2.0.4] - 2026-08-18',
            '',
        ]);
        const result = sandbox.Run([ '2.0.5' ]);
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain('already contains');
    });

    it('Should not modify anything in dry-run mode', () => {
        const result = sandbox.Run([ '2.0.5', '--dry-run' ]);
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('[dry-run]');
        expect(sandbox.ReadVersion('package.json')).toBe('2.0.4');
        expect(sandbox.ReadChangelog()).not.toContain('## [2.0.5]');
    });

    it('Should refuse when no version is provided', () => {
        const result = sandbox.Run([]);
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain('Usage');
    });
});
