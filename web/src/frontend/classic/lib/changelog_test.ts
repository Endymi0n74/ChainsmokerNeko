import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { ExtractVersionSection, RenderChangelogSection, RenderReleaseNotes } from './changelog';
// The changelog is bundled as text: the tests therefore verify the very same content
// which the application displays, without any network access.
import changelog from '../../../../../CHANGELOG.en.md?raw';

const applicationVersion = (JSON.parse(readFileSync(new URL('../../../../package.json', import.meta.url), 'utf-8')) as { version?: string }).version ?? '';

/** A minimal changelog in the same layout as the one of this repository (newest version first). */
const CHANGELOG = [
    '# Changelog',
    '',
    '## [1.0.10] - 2024-01-10',
    '',
    '- latest',
    '',
    '## [1.0.1] - 2024-01-02',
    '',
    '- middle',
    '',
    '## [1.0.0] - 2024-01-01',
    '',
    '### Fixed',
    '',
    '- oldest',
    '',
].join('\n');

describe('changelog.ExtractVersionSection', () => {

    it('Should extract the section of a version including its heading', () => {
        const section = ExtractVersionSection(CHANGELOG, '1.0.0');
        expect(section).toBe([
            '## [1.0.0] - 2024-01-01',
            '',
            '### Fixed',
            '',
            '- oldest',
        ].join('\n'));
    });

    it('Should stop at the heading of the next version', () => {
        const section = ExtractVersionSection(CHANGELOG, '1.0.1');
        expect(section).toContain('- middle');
        expect(section).not.toContain('- oldest');
    });

    it('Should not confuse a version with another one sharing its prefix', () => {
        expect(ExtractVersionSection(CHANGELOG, '1.0.1')).toContain('- middle');
        expect(ExtractVersionSection(CHANGELOG, '1.0.10')).toContain('- latest');
        expect(ExtractVersionSection(CHANGELOG, '1.0')).toBe('');
    });

    it('Should return an empty string for a version which is not documented', () => {
        expect(ExtractVersionSection(CHANGELOG, '9.9.9')).toBe('');
        expect(ExtractVersionSection('', '1.0.0')).toBe('');
    });

    it('Should support line feeds as well as carriage return line feeds', () => {
        const crlf = CHANGELOG.replace(/\n/g, '\r\n');
        expect(ExtractVersionSection(crlf, '1.0.0')).toContain('- oldest');
        expect(ExtractVersionSection(crlf, '9.9.9')).toBe('');
    });
});

describe('changelog.RenderChangelogSection', () => {

    it('Should render the release heading together with its date', () => {
        expect(RenderChangelogSection('## [3.0.14] - 2026-09-29')).toBe('<h4>3.0.14 — 2026-09-29</h4>');
        expect(RenderChangelogSection('## [3.0.15]')).toBe('<h4>3.0.15</h4>');
    });

    it('Should render the category headings of a release', () => {
        expect(RenderChangelogSection('### Fixed')).toBe('<h5>Fixed</h5>');
        expect(RenderChangelogSection('### Added')).toBe('<h5>Added</h5>');
    });

    it('Should never turn the changelog content into markup', () => {
        const html = RenderChangelogSection([
            '## [1.0.0] - 2024-01-01',
            '',
            '- **Injected** <script>alert("xss")</script> & "quoted"',
        ].join('\n'));
        expect(html).not.toContain('<script>');
        expect(html).not.toContain('"xss"');
        expect(html).toContain('alert(&quot;xss&quot;)');
        expect(html).toContain('&lt;script&gt;');
        expect(html).toContain('&amp;');
        expect(html).toContain('&quot;quoted&quot;');
    });

    it('Should render bold text, inline code and links', () => {
        const html = RenderChangelogSection('- **bold** with `code` and [a link](https://example.com/x?a=1&b=2)');
        expect(html).toContain('<strong>bold</strong>');
        expect(html).toContain('<code>code</code>');
        expect(html).toContain('<a href="https://example.com/x?a=1&amp;b=2" target="_blank" rel="noopener">a link</a>');
    });

    it('Should group bullets into a list and nest the indented ones', () => {
        const html = RenderChangelogSection([
            '- parent',
            '',
            '  - child',
            '- sibling',
        ].join('\n'));
        expect(html).toBe('<ul><li>parent<ul><li>child</li></ul></li><li>sibling</li></ul>');
    });

    it('Should interrupt the list on a paragraph', () => {
        const html = RenderChangelogSection(['- item', '', 'A paragraph'].join('\n'));
        expect(html).toBe('<ul><li>item</li></ul><p>A paragraph</p>');
    });

    it('Should render an empty section as an empty string', () => {
        expect(RenderChangelogSection('')).toBe('');
        expect(RenderChangelogSection('   \n  ')).toBe('');
    });
});

describe('changelog.ReleaseNotes', () => {

    it('Should document the version of the application', () => {
        expect(applicationVersion, 'web/package.json must expose a version').toMatch(/^\d+\.\d+\.\d+/);
        const notes = RenderReleaseNotes(changelog, applicationVersion);
        expect(notes, `CHANGELOG.en.md must document the version ${applicationVersion} of the application`).not.toBe('');
        expect(notes).toContain(`<h4>${applicationVersion}`);
    });

    it('Should render the bundled changelog without any raw markup', () => {
        const notes = RenderReleaseNotes(changelog, applicationVersion);
        expect(notes).not.toContain('<script');
        expect(notes).toContain('<h5>');
    });
});
