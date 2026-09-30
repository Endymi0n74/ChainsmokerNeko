/**
 * Helpers which turn the changelog of this repository into the "What's new" panel of the home page.
 * The changelog is embedded into the application bundle (raw import), so the panel is available
 * offline and does not rely on any remote documentation server (the panel it replaces was fetching
 * `hakuneko.download/docs/haruneko/`, a page of upstream placeholders).
 */

/** A release heading of the changelog, e.g. `## [3.0.14] - 2026-09-29`. */
const RELEASE_HEADING = /^## \[([^\]]+)\](?:\s+-\s+(.+))?$/;
/** A category heading within a release section, e.g. `### Fixed`. */
const CATEGORY_HEADING = /^###\s+(.+)$/;
/** A list item, e.g. `- **Fixed** ...`, with its indentation kept to support nested bullets. */
const LIST_ITEM = /^(\s*)[-*]\s+(.+)$/;
/** The characters which must not be interpreted as markup when the changelog is injected as HTML. */
const HTML_ENTITIES: Readonly<Record<string, string>> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
};

/** A bullet of a list, once its indentation has been resolved into a nesting level. */
type Bullet = {
    depth: number;
    text: string;
};

/** A bullet converted into a node of the list tree (its sub-bullets become its children). */
type BulletNode = {
    text: string;
    children: BulletNode[];
};

/**
 * Escapes the characters which would otherwise allow the changelog to inject markup into the page.
 * @param text - Any raw text of the changelog
 * @returns The text with all markup-significant characters replaced by their entity
 */
function EscapeHtml(text: string): string {
    return text.replace(/[&<>"]/g, character => HTML_ENTITIES[character]);
}

/**
 * Renders the inline markdown of the changelog (bold text, inline code and links) as HTML.
 * @param text - The raw text of a single markdown line
 * @returns The corresponding HTML fragment
 * @remarks The input is escaped first, hence no content of the changelog can ever
 * contribute an element, an attribute or a script to the rendered page.
 */
function RenderInline(text: string): string {
    return EscapeHtml(text)
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

/**
 * Renders a sequence of bullets as a (possibly nested) HTML list.
 * @param bullets - The bullets in the order of the changelog, each one with its indentation level
 * @returns The corresponding `<ul>` markup
 * @remarks The level never grows by more than one at once: an unexpected indentation
 * simply attaches the bullet to the deepest list which is actually open.
 */
function RenderBullets(bullets: readonly Bullet[]): string {
    const roots: BulletNode[] = [];
    const ancestors: BulletNode[] = [];
    for (const bullet of bullets) {
        const depth = Math.min(bullet.depth, ancestors.length);
        const node: BulletNode = { text: bullet.text, children: [] };
        if (depth === 0) {
            roots.push(node);
        } else {
            ancestors[depth - 1].children.push(node);
        }
        ancestors.length = depth;
        ancestors.push(node);
    }
    const render = (nodes: readonly BulletNode[]): string => `<ul>${nodes.map(node => `<li>${RenderInline(node.text)}${node.children.length > 0 ? render(node.children) : ''}</li>`).join('')}</ul>`;
    return render(roots);
}

/**
 * Extracts the section of a Keep a Changelog file which documents the given version.
 * @param changelog - The full content of the changelog
 * @param version - The version to be looked up (e.g. `3.0.14`)
 * @returns The section including its heading, or an empty string if the version is not documented
 * @remarks The heading is matched as a whole (`## [x.y.z]`), so the version `3.0.1` can never
 * be served with the section of `3.0.11`, and the section stops at the next release heading.
 */
export function ExtractVersionSection(changelog: string, version: string): string {
    const lines = changelog.split(/\r?\n/);
    const start = lines.findIndex(line => line.startsWith(`## [${version}]`));
    if (start < 0) {
        return '';
    }
    let end = lines.length;
    for (let index = start + 1; index < lines.length; index++) {
        if (lines[index].startsWith('## [')) {
            end = index;
            break;
        }
    }
    return lines.slice(start, end).join('\n').trim();
}

/**
 * Renders a release section of the changelog as HTML.
 * @param section - The section as returned by {@link ExtractVersionSection}
 * @returns The corresponding HTML fragment (empty for an empty section)
 */
export function RenderChangelogSection(section: string): string {
    const html: string[] = [];
    let paragraph: string[] = [];
    let bullets: Bullet[] = [];

    const flushParagraph = (): void => {
        if (paragraph.length > 0) {
            html.push(`<p>${RenderInline(paragraph.join(' '))}</p>`);
            paragraph = [];
        }
    };
    const flushBullets = (): void => {
        if (bullets.length > 0) {
            html.push(RenderBullets(bullets));
            bullets = [];
        }
    };
    const flushAll = (): void => {
        flushParagraph();
        flushBullets();
    };

    for (const rawLine of section.split(/\r?\n/)) {
        const line = rawLine.trim();
        // An empty line only interrupts the paragraph: a bullet list stays open, so the
        // blank lines between the items of a section do not split it into several lists.
        if (!line) {
            flushParagraph();
            continue;
        }
        const release = RELEASE_HEADING.exec(line);
        if (release) {
            flushAll();
            const date = release[2] ? ` — ${release[2]}` : '';
            html.push(`<h4>${RenderInline(`${release[1]}${date}`)}</h4>`);
            continue;
        }
        const category = CATEGORY_HEADING.exec(line);
        if (category) {
            flushAll();
            html.push(`<h5>${RenderInline(category[1])}</h5>`);
            continue;
        }
        const bullet = LIST_ITEM.exec(rawLine);
        if (bullet) {
            flushParagraph();
            bullets.push({ depth: Math.floor(bullet[1].length / 2), text: bullet[2] });
            continue;
        }
        // A plain paragraph interrupts a list (the changelog never interleaves both).
        flushBullets();
        paragraph.push(line);
    }
    flushAll();
    return html.join('');
}

/**
 * Extracts and renders the release notes of a single version.
 * @param changelog - The full content of the changelog
 * @param version - The version to be looked up (e.g. `3.0.14`)
 * @returns The HTML fragment for this version, or an empty string if it is not documented
 */
export function RenderReleaseNotes(changelog: string, version: string): string {
    return RenderChangelogSection(ExtractVersionSection(changelog, version));
}
