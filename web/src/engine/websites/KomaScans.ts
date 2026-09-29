import { Tags, type Tag } from '../Tags';
import icon from './KomaScans.webp';
import { Fetch, FetchNextJS } from '../platform/FetchProvider';
import { DecoratableMangaScraper, type MangaPlugin, Manga, Chapter, Page } from '../providers/MangaPlugin';
import { Exception } from '../Error';
import { WebsiteResourceKey as R } from '../../i18n/ILocale';
import { type Priority } from '../taskpool/TaskPool';
import * as Common from './decorators/Common';

type HydratedSeries = {
    seriesTitle: string;
    firstChapter: HydratedChapter | null;
    latestChapter: HydratedChapter | null;
    knownChapters: HydratedChapter[];
};

export type HydratedChapter = {
    id: string;
    language: string;
    slug: string;
    number: number;
    title: string;
    publishedAt: string;
};

type HydratedPages = {
    pages: HydratedPage[];
};

type HydratedPage = {
    id: string;
    position: number;
    url: string;
    /**
     * The translation overlay which the website renders on top of the untranslated page image (absent for the English locale).
     * @see {@link TranslationOverlay}
     */
    translationOverlay?: TranslationOverlay | null;
};

/**
 * The maximum amount of chapters which are hydrated within the RSC payload of a series page.
 * @see {@link https://komascans.com/en/series/nano-machine | KOMA Scans Series}
 */
const KNOWN_CHAPTERS_LIMIT = 50;

/**
 * The amount of sitemap documents which are requested concurrently to keep the peak memory usage low.
 */
const SITEMAP_REQUEST_BATCH_SIZE = 4;

/**
 * Words which are kept in lower case when reconstructing a title from a slug.
 */
const TITLE_PARTICLES = new Set([ 'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into', 'is', 'nor', 'of', 'on', 'or', 'per', 'the', 'to', 'via', 'vs', 'with' ]);

/**
 * Slug segments which are reconstructed as an apostrophe prefixed to the preceding word (e.g. `pirate-s` becomes `Pirate's`).
 */
const TITLE_CONTRACTIONS = new Set([ 'd', 'll', 'm', 're', 's', 't', 've' ]);

/**
 * Extracts the canonical identifier of the series for the given {@link url}.
 * @param url - An absolute or relative URL pointing to a series or a chapter page of the website
 * @returns The path of the series page (e.g. `/en/series/nano-machine`) or `null` when the {@link url} does not match the website structure
 * @remarks Chapter URLs (e.g. `/en/read/nano-machine/chapter-1`) are resolved to their series counterpart
 */
export function ResolveSeriesIdentifier(url: string): string | null {
    const match = /^(?:https?:\/\/[^/]+)?\/([a-z]{2}(?:-[a-z]{2})?)\/(?:series|read)\/([^/?#]+)/i.exec(url);
    return match ? `/${match[1].toLowerCase()}/series/${match[2].toLowerCase()}` : null;
}

/**
 * Reconstructs a human readable title from the slug of a series.
 * @param slug - The slug of a series (e.g. `the-pirate-s-slave-bride`)
 * @returns The approximated title (e.g. `The Pirate's Slave Bride`)
 * @remarks The website does not provide the series titles within its sitemap, therefore the title is derived from the slug,
 * which may not reflect the exact title (e.g. removed punctuation or unusual capitalization).
 */
export function SeriesTitleFromSlug(slug: string): string {
    const segments = slug.toLowerCase().split('-').filter(segment => segment.length > 0);
    return segments.reduce((title, segment, index) => {
        const previous = segments[index - 1];
        if (index > 0 && TITLE_CONTRACTIONS.has(segment) && previous && !TITLE_PARTICLES.has(previous)) {
            return `${title}'${segment}`;
        }
        const word = index > 0 && TITLE_PARTICLES.has(segment) ? segment : segment.charAt(0).toUpperCase() + segment.slice(1);
        return title ? `${title} ${word}` : word;
    }, '');
}

/**
 * Creates a display title for a chapter from its slug (e.g. `chapter-113-5` becomes `Chapter 113.5`).
 * @param slug - The slug of a chapter
 */
export function ChapterTitleFromSlug(slug: string): string {
    const match = /^chapter-(\d+)(?:[.-](\d+))?$/.exec(slug);
    if (!match) {
        return SeriesTitleFromSlug(slug);
    }
    return match[2] === undefined ? `Chapter ${match[1]}` : `Chapter ${match[1]}.${match[2]}`;
}

/**
 * Extracts the numeric chapter order from the slug of a chapter (e.g. `chapter-113-5` becomes `113.5`).
 * @param slug - The slug of a chapter
 * @returns The chapter number or `Number.NaN` for slugs which do not encode a chapter number
 */
export function MapChapterNumber(slug: string): number {
    const match = /^chapter-(\d+)(?:[.-](\d+))?$/.exec(slug);
    if (!match) {
        return Number.NaN;
    }
    return match[2] === undefined ? Number(match[1]) : Number(`${match[1]}.${match[2]}`);
}

/**
 * Composes the display title of a chapter from the data hydrated from the website.
 * @param chapter - The chapter data as provided by the website
 * @remarks The chapter number is prefixed for titles which do not already contain one (e.g. `107: Special Forces <4>` becomes `Chapter 331 - 107: Special Forces <4>`)
 */
export function MapChapterTitle(chapter: HydratedChapter): string {
    const title = (chapter.title ?? '').trim();
    const number = Number.isFinite(chapter.number) ? `Chapter ${chapter.number}` : '';
    if (!title) {
        return number || ChapterTitleFromSlug(chapter.slug);
    }
    return /^ch(?:apter)?\.?\s*\d/i.test(title) ? title : number ? `${number} - ${title}` : title;
}

/**
 * The chapter word which the website itself renders for a localized locale (e.g. `Chapitre 1` for the French locale),
 * while the chapter titles are stored in English for every locale. Locales which are missing from this table are
 * rendered by the website with the English word (e.g. `Chapter 1` for the German locale).
 */
const CHAPTER_LABELS: Record<string, string> = {
    es: 'Capítulo',
    fr: 'Chapitre',
};

/**
 * Replaces the leading chapter word of the given {@link title} with the word which the website renders for {@link locale}.
 * @param title - A chapter title which may start with a chapter word (e.g. `Chapter 1 - Start Reading`)
 * @param locale - The locale segment of the series identifier (e.g. `fr`)
 * @returns The title carrying the localized chapter word (e.g. `Chapitre 1 - Start Reading`) or the unchanged title
 * @remarks Titles without a leading chapter word (e.g. `Start Reading`) and locales which are rendered in English by
 * the website (e.g. `de`) are left untouched, so the connector never diverges from the labels of the website.
 */
export function LocalizeChapterWord(title: string, locale: string): string {
    const label = CHAPTER_LABELS[locale];
    return label ? title.replace(/^(?:chapter|chap|ch)(?:\.\s*|\s+)/i, `${label} `) : title;
}

/**
 * Resolves the language tag for the given {@link identifier} based on the locale segment of its path.
 */
function MapLanguageTag(identifier: string): Tag {
    switch (identifier.split('/')[1]) {
        case 'ar':
            return Tags.Language.Arabic;
        case 'de':
            return Tags.Language.German;
        case 'es':
            return Tags.Language.Spanish;
        case 'fr':
            return Tags.Language.French;
        case 'id':
            return Tags.Language.Indonesian;
        case 'pt':
            return Tags.Language.Portuguese;
        case 'tr':
            return Tags.Language.Turkish;
        default:
            return Tags.Language.English;
    }
}

/***********************************************
 ******** Page translation overlays ***********
 ***********************************************/

/**
 * A rectangular region of the page canvas as used by the translation overlay of the website.
 */
type OverlayBox = {
    x: number;
    y: number;
    width: number;
    height: number;
};

/**
 * A geometric shape which is painted with a solid color to remove the source text of a region.
 */
type OverlayShape =
    | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
    | { kind: 'rounded-rect'; x: number; y: number; width: number; height: number; radius: number }
    | { kind: 'polygon'; points: { x: number; y: number }[] };

/**
 * Describes how the source text of a region is removed from the page image before the translation is drawn.
 * @remarks Only the `patch` cleanup is relevant for HakuNeko, because its layer is the only one which removes the English text.
 */
type OverlayCleanup =
    | { kind: 'patch'; box: OverlayBox }
    | { kind: 'preserve' }
    | { kind: 'solid'; color: string; shape: OverlayShape };

type OverlayStroke = { color: string; width: number };
type OverlayShadow = { color: string; offsetX: number; offsetY: number; blur: number };

/**
 * The visual style of a source region as extracted by the website during its text recognition step.
 */
type OverlayStyle = {
    fontFamily?: string;
    color?: string;
    fontWeight?: number;
    fontStyle?: string;
    textAlign?: string;
    verticalAlign?: string;
    direction?: string;
    writingMode?: string;
    effectsReviewed?: boolean;
    stroke?: OverlayStroke;
    shadow?: OverlayShadow;
};

/**
 * A region of the page image which carries the recognized source text (e.g. a speech balloon).
 */
type OverlaySourceRegion = {
    id: string;
    kind: string;
    letteringRole?: string;
    sourceText: string;
    readingOrder: number;
    textBox: OverlayBox;
    rotation: number;
    cleanup: OverlayCleanup;
    style: OverlayStyle;
};

/**
 * The translated content of a source region as delivered within the RSC payload of a chapter page.
 */
type OverlayTranslationRegion = {
    regionId: string;
    text: string;
    lines?: string[];
    fontSize: number;
    lineHeight: number;
    direction?: string;
    fontFamily?: string;
    textBox?: OverlayBox;
    visible?: boolean;
};

/**
 * The translation overlay of a single page as provided by the website for all locales except English.
 * @remarks The website never provides a translated image: `page.url` always points to the untranslated (English) image,
 * while the translation is rendered within the browser by combining a patch layer (`cleanLayerUrl`) with SVG text.
 */
export type TranslationOverlay = {
    schemaVersion: number;
    canvas: { width: number; height: number };
    regions: OverlaySourceRegion[];
    cleanLayerUrl?: string | null;
    translation: { schemaVersion: number; language: string; regions: OverlayTranslationRegion[] };
};

/**
 * A source region merged with its translation, ready to be rendered (counterpart of the website's `calculateOverlayTextLayout` memo).
 */
export type PreparedOverlayRegion = {
    box: OverlayBox;
    color: string;
    direction: string;
    fontFamily: string;
    glyphAscenderRatio: number;
    glyphHeightRatio: number;
    fontSize: number;
    fontStyle: string;
    fontWeight: number;
    language: string;
    lineHeight: number;
    lines: string[];
    preserveNaturalGlyphWidth: boolean;
    runtimeFitRequired: boolean;
    region: OverlaySourceRegion;
    shadow?: OverlayShadow;
    stroke?: OverlayStroke;
    textAlign: string;
    verticalAlign: string;
    writingMode: string;
};

const OVERLAY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const OVERLAY_LANGUAGE_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const OVERLAY_COLOR_PATTERN = /^#(?:[\dA-Fa-f]{3,4}|[\dA-Fa-f]{6}|[\dA-Fa-f]{8})$/;

/**
 * The glyph advance widths (in em) of the `Comic Relief` font which the website uses for its dialogue text.
 */
const COMIC_RELIEF_WIDTHS: Record<string, number> = {
    ' ': 0.298828125, A: 0.731453125, B: 0.630375, C: 0.602546875, D: 0.7216875, E: 0.624515625, F: 0.6069375, G: 0.6796875, H: 0.7680625, I: 0.546390625, J: 0.665046875, K: 0.61084375, L: 0.55078125, M: 0.8828125, N: 0.796875, O: 0.79834375, P: 0.520515625, Q: 0.87646875, R: 0.628421875, S: 0.693359375, T: 0.6796875, U: 0.7368125, V: 0.64990625, W: 1.039546875, X: 0.723640625, Y: 0.63525, Z: 0.693359375,
    '0': 0.610359375, '1': 0.450203125, '2': 0.610359375, '3': 0.610359375, '4': 0.610359375, '5': 0.610359375, '6': 0.610359375, '7': 0.610359375, '8': 0.610359375, '9': 0.610359375,
    '!': 0.237796875, '?': 0.523921875, '.': 0.24903125, ',': 0.276859375, ':': 0.298828125, ';': 0.298828125, '…': 0.675296875, '—': 0.8828125, '–': 0.44140625, '-': 0.4165, '(': 0.36621875, ')': 0.36621875, '[': 0.37646875, ']': 0.37646875, '{': 0.36621875, '}': 0.36621875, '«': 0.577640625, '»': 0.577640625, '“': 0.3935625, '”': 0.3935625, "'": 0.3881875, '’': 0.180171875, '/': 0.51171875, '\\': 0.5498125, '%': 0.8203125, '+': 0.48046875, Œ: 1.19384375, Æ: 1.086921875,
};

/**
 * The font stack which is used for a font key of the website when the stylesheet of the website cannot be evaluated.
 */
const OVERLAY_FONT_FALLBACKS: Record<string, string> = {
    'latin-dialogue': '"Comic Relief", "Kalam", "Patrick Hand SC", sans-serif',
    'latin-narration': 'Oswald, "Arial Narrow", "Roboto Condensed", sans-serif',
    'latin-display': '"Barlow Condensed", Impact, "Arial Narrow", sans-serif',
    'comic-sfx': '"Koma Patrick Hand SC", "Patrick Hand SC", ui-rounded, sans-serif',
    'arabic-dialogue': '"Noto Sans Arabic", "Noto Naskh Arabic", Tahoma, Arial, sans-serif',
    'arabic-display': '"Noto Kufi Arabic", "Noto Sans Arabic", Tahoma, Arial, sans-serif',
    'cjk-dialogue': '"Noto Sans CJK JP", "Noto Sans JP", sans-serif',
    'cjk-display': '"Noto Serif CJK JP", "Noto Serif JP", serif',
    'universal-sans': 'Inter, ui-sans-serif, system-ui, sans-serif',
};

function IsFiniteNumber(value: unknown): value is number {
    return Number.isFinite(value);
}

function IsPositiveNumber(value: unknown): value is number {
    return Number.isFinite(value) && (value as number) > 0;
}

function IsValidOverlayBox(box: unknown): box is OverlayBox {
    const value = box as OverlayBox;
    return !!value && IsFiniteNumber(value.x) && IsFiniteNumber(value.y) && IsPositiveNumber(value.width) && IsPositiveNumber(value.height);
}

function IsValidOverlayColor(color: unknown): color is string {
    return typeof color === 'string' && OVERLAY_COLOR_PATTERN.test(color);
}

/**
 * Determines whether a source region carries lettering (speech balloons are always lettered).
 * @param kind - The kind of the source region (e.g. `dialogue`)
 * @param letteringRole - The lettering role of the source region as extracted by the website (e.g. `balloon`)
 */
export function IsOverlayLettering(kind: string, letteringRole?: string): boolean {
    return letteringRole !== undefined ? letteringRole === 'balloon' : kind === 'dialogue';
}

/**
 * Removes control characters which cannot be rendered from the given {@link text}.
 */
export function SanitizeOverlayText(text: string): string {
    return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, '');
}

/**
 * Estimates the advance width of the given {@link text} in em units using generic glyph classes.
 */
export function EstimateOverlayWidth(text: string): number {
    let width = 0;
    for (const character of Array.from(text)) {
        const codePoint = character.codePointAt(0) ?? 0;
        if (/\s/u.test(character)) {
            width += 0.32;
        } else if (codePoint >= 11904 && codePoint <= 40959 || codePoint >= 44032 && codePoint <= 55215 || codePoint > 65535) {
            width += 1;
        } else if (codePoint >= 1536 && codePoint <= 2303 || codePoint >= 64336 && codePoint <= 65023 || codePoint >= 65136 && codePoint <= 65279) {
            width += 0.64;
        } else if (/[MW@#%&]/u.test(character)) {
            width += 0.82;
        } else if (/[ilI1.,:;'’!|]/u.test(character)) {
            width += 0.3;
        } else if (/[A-Z0-9]/u.test(character)) {
            width += 0.62;
        } else {
            width += 0.54;
        }
    }
    return width;
}

/**
 * Estimates the advance width of the given {@link text} in em units using the glyph metrics of the `Comic Relief` font.
 */
export function EstimateComicReliefWidth(text: string): number {
    let width = 0;
    for (const character of Array.from(text.normalize('NFD'))) {
        if (!/\p{M}/u.test(character)) {
            width += COMIC_RELIEF_WIDTHS[character] ?? EstimateOverlayWidth(character);
        }
    }
    return width;
}

/**
 * Estimates the advance width of the given {@link text} in em units for vertical writing modes.
 */
export function EstimateOverlayVerticalWidth(text: string): number {
    let width = 0;
    for (const character of Array.from(text)) {
        width += /\s/u.test(character) ? 0.4 : 1;
    }
    return width;
}

/**
 * Splits the given {@link text} into words, keeping trailing punctuation attached to the preceding word.
 */
export function BreakOverlayWords(text: string): string[] {
    const tokens = text.replace(/\s+/gu, ' ').trim().split(' ').filter(Boolean);
    const words: string[] = [];
    for (const token of tokens) {
        if (/^[!?,.:;…’”»)\]}]+$/u.test(token) && words.length > 0) {
            words[words.length - 1] += token;
        } else {
            words.push(token);
        }
    }
    return words;
}

/**
 * Normalizes the lines of a translation for rendering.
 * @param lines - The lines as provided by the website
 * @param fontFamily - The font key of the region (e.g. `latin-dialogue`)
 * @param language - The language tag of the translation (e.g. `fr`)
 * @param sourceText - The source text of the region which the website recognized (e.g. `MY NAME IS SUHO KIM.`)
 * @remarks The website renders dialogue and sound effects in upper case, and keeps the case of all other text unless its source text is written in upper case only.
 */
export function NormalizeOverlayLines(lines: string[], fontFamily: string, language: string, sourceText: string): string[] {
    const letters = [ ...(sourceText ?? '').matchAll(/\p{L}/gu) ].map(entry => entry[0]);
    const isUpperCase = letters.length >= 2 && letters.some(letter => letter.toUpperCase() !== letter.toLowerCase()) && letters.every(letter => letter === letter.toUpperCase());
    if (fontFamily !== 'latin-dialogue' && fontFamily !== 'comic-sfx' && !isUpperCase) {
        return lines;
    }
    try {
        return lines.map(line => line.toLocaleUpperCase(language));
    } catch {
        return lines.map(line => line.toUpperCase());
    }
}

/**
 * Determines whether the source text of a region must be removed from the page image before the translation is drawn.
 */
export function IsValidOverlayCleanup(cleanup: unknown): boolean {
    const value = cleanup as OverlayCleanup;
    if (!value || typeof value !== 'object' || !('kind' in value)) {
        return false;
    }
    if (value.kind === 'preserve') {
        return true;
    }
    if (value.kind === 'patch') {
        return IsValidOverlayBox(value.box);
    }
    if (!IsValidOverlayColor(value.color)) {
        return false;
    }
    const shape = value.shape;
    if (shape.kind === 'ellipse') {
        return IsFiniteNumber(shape.cx) && IsFiniteNumber(shape.cy) && IsPositiveNumber(shape.rx) && IsPositiveNumber(shape.ry);
    }
    if (shape.kind === 'rounded-rect') {
        return IsFiniteNumber(shape.x) && IsFiniteNumber(shape.y) && IsPositiveNumber(shape.width) && IsPositiveNumber(shape.height) && IsFiniteNumber(shape.radius) && shape.radius >= 0;
    }
    return Array.isArray(shape.points) && shape.points.length >= 3 && shape.points.every(point => IsFiniteNumber(point.x) && IsFiniteNumber(point.y));
}

/**
 * Resolves a URL pointing to an asset of the website (e.g. the patch layer of a page) against the {@link origin} of the website.
 * @returns The absolute URL or `null` when the given {@link url} is not a safe URL of the website
 */
export function ResolveOverlayAssetUrl(url: string | null | undefined, origin: string): string | null {
    if (!url || typeof url !== 'string' || url.length > 2048 || url.startsWith('//') || url.includes('\\')) {
        return null;
    }
    if (url.startsWith('/')) {
        return new URL(url, origin).href;
    }
    try {
        const link = new URL(url);
        return link.protocol === 'https:' ? link.href : null;
    } catch {
        return null;
    }
}

/**
 * Splits the given {@link text} into {@link maxLines} lines with the given {@link widthFn} while keeping the lines balanced.
 * @remarks Ported from the word wrapping algorithm of the website (`text-layout`), which minimizes the squared deviation of each line from the average line width.
 */
export function WrapOverlayLines(text: string, maxLines: number, widthFn: (line: string) => number = EstimateOverlayWidth): string[] {
    const words = BreakOverlayWords(text);
    if (words.length === 0) {
        return [];
    }
    const lineCount = Math.min(words.length, Math.max(1, Math.floor(maxLines)));
    if (lineCount === 1) {
        return [ words.join(' ') ];
    }
    const costs = words.map(word => widthFn(word));
    const prefix = [ 0 ];
    for (const cost of costs) {
        prefix.push(prefix[prefix.length - 1] + cost);
    }
    const space = widthFn(' ');
    const target = (prefix[prefix.length - 1] + space * Math.max(0, words.length - lineCount)) / lineCount;
    const lineCost = (start: number, end: number) => prefix[end] - prefix[start] + space * Math.max(0, end - start - 1);
    const table = Array.from({ length: lineCount + 1 }, () => Array<number>(words.length + 1).fill(Number.POSITIVE_INFINITY));
    const backtrack = Array.from({ length: lineCount + 1 }, () => Array<number>(words.length + 1).fill(-1));
    table[0][0] = 0;
    for (let lines = 1; lines <= lineCount; lines += 1) {
        const minimumEnd = lines;
        const maximumEnd = words.length - (lineCount - lines);
        for (let end = minimumEnd; end <= maximumEnd; end += 1) {
            for (let start = lines - 1; start <= end - 1; start += 1) {
                const previous = table[lines - 1][start];
                if (!Number.isFinite(previous)) {
                    continue;
                }
                const deviation = lineCost(start, end) - target;
                const total = previous + deviation * deviation;
                if (total < table[lines][end]) {
                    table[lines][end] = total;
                    backtrack[lines][end] = start;
                }
            }
        }
    }
    const lines: string[] = Array<string>(lineCount);
    let cursor = words.length;
    for (let index = lineCount; index >= 1; index -= 1) {
        const start = backtrack[index][cursor];
        if (start < 0) {
            return GreedyOverlayWrap(text, target, widthFn);
        }
        lines[index - 1] = words.slice(start, cursor).join(' ');
        cursor = start;
    }
    return lines;
}

/**
 * Wraps the given {@link text} into lines which do not exceed the given {@link maxWidth}.
 */
function GreedyOverlayWrap(text: string, maxWidth: number, widthFn: (line: string) => number): string[] {
    const lines: string[] = [];
    let current = '';
    for (const token of text.trim().split(/\s+/u)) {
        const candidate = current ? `${current} ${token}` : token;
        if (current && widthFn(candidate) > maxWidth) {
            lines.push(current);
            current = token;
        } else {
            current = candidate;
        }
    }
    if (current) {
        lines.push(current);
    }
    return lines;
}

/**
 * Wraps the given {@link text} into the given {@link maxLines} and computes the largest font size which fits into the {@link box}.
 * @returns The lines with their font size, or `null` when the text cannot be rendered with at least 6px
 */
export function FitOverlayTextToBox(text: string, box: OverlayBox, maxLines: number, lineHeight: number, widthFn: (line: string) => number = EstimateOverlayWidth, aspect = 0.86): { lines: string[], fontSize: number, lineHeight: number } | null {
    const lines = WrapOverlayLines(text, maxLines, widthFn);
    if (lines.length === 0) {
        return null;
    }
    const widest = Math.max(...lines.map(widthFn), 0);
    if (widest <= 0) {
        return null;
    }
    const fontSize = Math.floor(2 * Math.min(64, box.width * aspect / widest, 0.9 * box.height / (lines.length * lineHeight))) / 2;
    if (!Number.isFinite(fontSize) || fontSize < 6) {
        return null;
    }
    return { lines, fontSize: Number(fontSize.toFixed(1)), lineHeight };
}

/**
 * Measures the space which the given {@link lines} occupy at the given {@link fontSize}.
 * @param style - Additional properties which expand the measured area (rotation, stroke, shadow)
 * @returns The width and height of the text block or `null` when the lines cannot be measured
 */
export function OverlayTextSize(lines: string[], fontSize: number, lineHeight: number, writingMode: string, style: { glyphHeightRatio?: number, rotation?: number, strokeWidth?: number, shadowBlur?: number, shadowOffsetX?: number, shadowOffsetY?: number } = {}): { width: number, height: number } | null {
    if (lines.length === 0 || !IsPositiveNumber(fontSize) || !IsPositiveNumber(lineHeight)) {
        return null;
    }
    const vertical = writingMode === 'vertical-rl';
    const units = Math.max(...lines.map(line => vertical ? EstimateOverlayVerticalWidth(line) : EstimateOverlayWidth(line)), 0);
    if (units <= 0) {
        return null;
    }
    const width = fontSize * (vertical ? lines.length * lineHeight : units);
    const heightRatio = IsFiniteNumber(style.glyphHeightRatio) ? Math.max(1, style.glyphHeightRatio ?? 1) : 1;
    const height = fontSize * (vertical ? units : heightRatio + Math.max(0, lines.length - 1) * lineHeight);
    const radians = IsFiniteNumber(style.rotation) ? Math.abs(style.rotation ?? 0) * Math.PI / 180 : 0;
    const cosine = Math.abs(Math.cos(radians));
    const sine = Math.abs(Math.sin(radians));
    const stroke = IsFiniteNumber(style.strokeWidth) ? Math.max(0, style.strokeWidth ?? 0) : 0;
    const blur = IsFiniteNumber(style.shadowBlur) ? Math.max(0, style.shadowBlur ?? 0) : 0;
    const offsetX = IsFiniteNumber(style.shadowOffsetX) ? Math.abs(style.shadowOffsetX ?? 0) : 0;
    const offsetY = IsFiniteNumber(style.shadowOffsetY) ? Math.abs(style.shadowOffsetY ?? 0) : 0;
    return {
        width: width * cosine + height * sine + stroke + 2 * offsetX + 4 * blur,
        height: width * sine + height * cosine + stroke + 2 * offsetY + 4 * blur,
    };
}

/**
 * Computes the position of every line of a text block within its {@link box}.
 * @remarks This is the counterpart of the line positioning of the website, which is applied to every SVG `<text>` element.
 */
export function LayoutOverlayTextBlock(layout: {
    box: OverlayBox,
    direction?: string,
    fontSize: number,
    glyphAscenderRatio?: number,
    glyphHeightRatio?: number,
    lineCount: number,
    lineHeight: number,
    textAlign?: string,
    verticalAlign?: string,
    writingMode?: string,
}): { dominantBaseline: 'alphabetic' | 'middle', linePositions: { x: number, y: number }[], textAnchor: 'start' | 'middle' | 'end' } {
    const lineCount = Math.max(1, Math.floor(layout.lineCount));
    const advance = layout.fontSize * layout.lineHeight;
    if (layout.writingMode === 'vertical-rl') {
        const spread = (lineCount - 1) * advance;
        const start = layout.box.x + layout.box.width / 2 + spread / 2;
        return {
            dominantBaseline: 'middle',
            linePositions: Array.from({ length: lineCount }, (_, index) => ({ x: start - advance * index, y: layout.box.y + layout.box.height / 2 })),
            textAnchor: 'middle',
        };
    }
    const height = layout.fontSize * (layout.glyphHeightRatio ?? 1) + (lineCount - 1) * advance;
    const free = Math.max(0, layout.box.height - height);
    const baseline = layout.box.y + (layout.verticalAlign === 'top' ? 0 : layout.verticalAlign === 'bottom' ? free : free / 2) + layout.fontSize * (layout.glyphAscenderRatio ?? 0.82);
    const start = layout.textAlign === 'left' ? layout.box.x : layout.textAlign === 'right' ? layout.box.x + layout.box.width : layout.box.x + layout.box.width / 2;
    let anchor: 'start' | 'middle' | 'end';
    if (layout.textAlign === 'center') {
        anchor = 'middle';
    } else if (layout.direction === 'rtl') {
        anchor = layout.textAlign === 'left' ? 'end' : 'start';
    } else {
        anchor = layout.textAlign === 'left' ? 'start' : 'end';
    }
    return {
        dominantBaseline: 'alphabetic',
        linePositions: Array.from({ length: lineCount }, (_, index) => ({ x: start, y: baseline + advance * index })),
        textAnchor: anchor,
    };
}

/**
 * Wraps the given {@link text} into the given {@link maxLines} and keeps the current font size when it already fits into the {@link box}.
 */
function FitOverlayTextIntoBox(text: string, box: OverlayBox, maxLines: number, lineHeight: number): { lines: string[], fontSize: number } | null {
    const normalized = text.replace(/\s+/gu, ' ').trim();
    const words = BreakOverlayWords(normalized);
    if (words.length === 0 || !IsFiniteNumber(lineHeight) || lineHeight <= 0) {
        return null;
    }
    const preferred = Math.min(words.length, Math.max(1, Math.floor(maxLines)));
    const limit = Math.min(words.length, 64);
    const candidates = [ preferred, preferred - 1, preferred + 1 ]
        .filter((value, index, all) => value >= 1 && value <= limit && all.indexOf(value) === index)
        .map(count => FitOverlayTextToBox(normalized, box, count, lineHeight))
        .filter(result => result !== null);
    const exact = candidates.find(result => result.lines.length === preferred);
    const alternatives = Array.from({ length: limit }, (_, index) => index + 1)
        .map(count => FitOverlayTextToBox(normalized, box, count, lineHeight))
        .filter(result => result !== null);
    if (exact) {
        if (exact.lines.length === 1 && exact.fontSize >= 26) {
            return exact;
        }
        if (exact.fontSize < 26) {
            const larger = alternatives.filter(result => result.fontSize >= 26)
                .sort((left, right) => Math.abs(left.lines.length - preferred) - Math.abs(right.lines.length - preferred) || right.fontSize - left.fontSize)[0];
            if (larger) {
                return larger;
            }
            const widest = alternatives.reduce((current, next) => next.fontSize > current.fontSize || next.fontSize === current.fontSize && Math.abs(next.lines.length - preferred) < Math.abs(current.lines.length - preferred) ? next : current);
            if (widest.fontSize > exact.fontSize) {
                return widest;
            }
        }
        return candidates.reduce((current, next) => next.fontSize >= 1.18 * current.fontSize || next.lines.length < current.lines.length && next.fontSize >= current.fontSize ? next : current, exact);
    }
    if (candidates.length > 0) {
        return candidates.reduce((current, next) => next.fontSize > current.fontSize ? next : current);
    }
    for (let count = preferred + 2; count <= limit; count += 1) {
        const result = FitOverlayTextToBox(normalized, box, count, lineHeight);
        if (result) {
            return result;
        }
    }
    return null;
}

/**
 * Wraps the given {@link text} into the {@link box} using the glyph metrics of the `Comic Relief` font (dialogue text of the website).
 */
function ReflowOverlayDialogue(text: string, box: OverlayBox, lineHeight: number): { lines: string[], fontSize: number } | null {
    const normalized = text.replace(/\s+/gu, ' ').trim();
    const words = BreakOverlayWords(normalized);
    if (words.length === 0 || !IsFiniteNumber(lineHeight) || lineHeight <= 0) {
        return null;
    }
    const widthFn = (line: string) => 1.12 * EstimateComicReliefWidth(line);
    const results = Array.from({ length: Math.min(words.length, 64) }, (_, index) => index + 1)
        .map(count => FitOverlayTextToBox(normalized, box, count, lineHeight, widthFn, 0.94))
        .filter(result => result !== null);
    if (results.length === 0) {
        return null;
    }
    return results.reduce((current, next) => next.fontSize > current.fontSize || next.fontSize === current.fontSize && next.lines.length < current.lines.length ? next : current);
}

/**
 * Reduces the font size of the given {@link lines} when they do not fit into the {@link box} in a horizontal writing mode.
 */
function FitOverlayTextHorizontal(lines: string[], box: OverlayBox, lineHeight: number, fontSize: number): number {
    const units = Math.max(...lines.map(EstimateOverlayWidth), 0);
    if (lines.length === 0 || units <= 0 || !IsFiniteNumber(lineHeight) || lineHeight <= 0) {
        return fontSize;
    }
    const candidate = Math.min(64, 0.86 * box.width / units, 0.9 * box.height / (lines.length * lineHeight));
    return !Number.isFinite(candidate) || candidate <= fontSize ? fontSize : Number((Math.floor(2 * candidate) / 2).toFixed(1));
}

/**
 * Reduces the font size of the given {@link lines} when they do not fit into the {@link box} in a vertical writing mode.
 */
function FitOverlayTextVertical(lines: string[], box: OverlayBox, lineHeight: number, fontSize: number): number {
    const units = Math.max(...lines.map(EstimateOverlayVerticalWidth), 0);
    if (lines.length === 0 || units <= 0 || !IsFiniteNumber(lineHeight) || lineHeight <= 0) {
        return fontSize;
    }
    const candidate = Math.min(256, 0.88 * box.height / units, 0.82 * box.width / (lines.length * lineHeight));
    return !Number.isFinite(candidate) || candidate <= fontSize ? fontSize : Number((Math.floor(2 * candidate) / 2).toFixed(1));
}

/**
 * Reduces the given {@link fontSize} until the measured space of the {@link lines} (including rotation, stroke and shadow) fits into the {@link box}.
 */
function ClampOverlayFontSize(lines: string[], box: OverlayBox, lineHeight: number, fontSize: number, writingMode: string, style: { glyphHeightRatio?: number, rotation?: number, strokeWidth?: number, shadowBlur?: number, shadowOffsetX?: number, shadowOffsetY?: number }): number {
    if (lines.length === 0 || !IsFiniteNumber(fontSize) || fontSize <= 0 || !IsFiniteNumber(box.width) || !IsFiniteNumber(box.height) || box.width <= 0 || box.height <= 0) {
        return fontSize;
    }
    const natural = OverlayTextSize(lines, 1, lineHeight, writingMode, { glyphHeightRatio: style.glyphHeightRatio, rotation: style.rotation });
    if (!natural) {
        return fontSize;
    }
    const vertical = writingMode === 'vertical-rl';
    const availableWidth = box.width * (vertical ? 0.82 : 0.86);
    const availableHeight = box.height * (vertical ? 0.88 : 0.9);
    const decorated = OverlayTextSize(lines, 0.5, lineHeight, writingMode, style);
    const plain = OverlayTextSize(lines, 0.5, lineHeight, writingMode, { glyphHeightRatio: style.glyphHeightRatio, rotation: style.rotation });
    if (!decorated || !plain) {
        return fontSize;
    }
    const extraWidth = Math.max(0, decorated.width - plain.width);
    const extraHeight = Math.max(0, decorated.height - plain.height);
    const candidate = Math.min(vertical ? 256 : 64, (availableWidth - extraWidth) / natural.width, (availableHeight - extraHeight) / natural.height);
    return !Number.isFinite(candidate) || candidate <= 0 ? 0.5 : Number(Math.max(0.5, Math.floor(2 * Math.min(fontSize, candidate)) / 2).toFixed(1));
}

/**
 * Reduces the given {@link fontSize} so the given {@link lines} (measured with the `Comic Relief` metrics) leave a margin within their {@link box}.
 */
function FitOverlayTextWidth(lines: string[], box: OverlayBox, fontSize: number): number {
    const natural = 1.12 * Math.max(...lines.map(EstimateComicReliefWidth), 0);
    if (natural <= 0) {
        return fontSize;
    }
    const candidate = 0.94 * box.width / natural;
    return !Number.isFinite(candidate) || candidate <= 0 ? 0.5 : fontSize <= candidate ? fontSize : Number(Math.max(0.5, Math.floor(2 * candidate) / 2).toFixed(1));
}

/**
 * Indexes the source regions of an overlay by their identifier.
 * @remarks Identifiers which are duplicated or which do not carry a valid text box are discarded, because their translation cannot be placed.
 */
function IndexOverlaySourceRegions(regions: OverlaySourceRegion[]): Map<string, OverlaySourceRegion> {
    const occurrences = new Map<string, number>();
    for (const region of regions ?? []) {
        occurrences.set(region.id, (occurrences.get(region.id) ?? 0) + 1);
    }
    const index = new Map<string, OverlaySourceRegion>();
    for (const region of regions ?? []) {
        if (OVERLAY_ID_PATTERN.test(region.id) && occurrences.get(region.id) === 1 && IsValidOverlayBox(region.textBox)) {
            index.set(region.id, region);
        }
    }
    return index;
}

/**
 * Merges a source region with its translation into a region which is ready to be rendered.
 * @returns The prepared region or `null` when the translation cannot be rendered on the page image
 */
function PrepareOverlayRegion(source: OverlaySourceRegion, translation: OverlayTranslationRegion, language: string): PreparedOverlayRegion | null {
    const requestedFamily = translation.fontFamily ?? source.style.fontFamily;
    const isReflowed = IsOverlayLettering(source.kind, source.letteringRole) && source.style.writingMode === 'horizontal-tb'
        && (requestedFamily === 'latin-dialogue' || requestedFamily === 'latin-display' || requestedFamily === 'comic-sfx');
    const box = translation.textBox ?? source.textBox;
    const fontFamily = isReflowed ? 'latin-dialogue' : requestedFamily;
    const lineHeight = isReflowed ? 1.02 : translation.lineHeight;
    const color = (source.style.color ?? '').toUpperCase() === '#18181E' ? '#000000' : source.style.color;
    const glyphHeightRatio = fontFamily === 'latin-dialogue' ? 1.4 : fontFamily === 'latin-narration' ? 1.5 : 1;
    const glyphAscenderRatio = fontFamily === 'latin-dialogue' ? 1.02 : fontFamily === 'latin-narration' ? 1.21 : 0.82;
    const lines = NormalizeOverlayLines((translation.lines?.length ? translation.lines : (translation.text ?? '').split(/\r?\n/u)).map(SanitizeOverlayText).slice(0, 64), fontFamily, language, source.sourceText);

    if (!IsValidOverlayCleanup(source.cleanup) || !IsValidOverlayBox(box) || !IsValidOverlayColor(color) || !IsPositiveNumber(translation.fontSize)
        || !(IsFiniteNumber(translation.lineHeight) && translation.lineHeight >= 0.8 && translation.lineHeight <= 2.5) || !IsFiniteNumber(source.rotation) || lines.length === 0) {
        return null;
    }

    const suppressEffects = fontFamily === 'latin-dialogue' && source.kind !== 'sfx' && source.style.effectsReviewed !== true;
    const rawStroke = suppressEffects ? undefined : source.style.stroke;
    const rawShadow = suppressEffects ? undefined : source.style.shadow;
    const stroke = rawStroke && IsValidOverlayColor(rawStroke.color) && IsFiniteNumber(rawStroke.width) && rawStroke.width >= 0 && rawStroke.width <= 12
        ? { color: rawStroke.color, width: rawStroke.width }
        : undefined;
    const shadow = rawShadow && IsValidOverlayColor(rawShadow.color) && IsFiniteNumber(rawShadow.offsetX) && IsFiniteNumber(rawShadow.offsetY) && IsFiniteNumber(rawShadow.blur)
        && rawShadow.offsetX >= -32 && rawShadow.offsetX <= 32 && rawShadow.offsetY >= -32 && rawShadow.offsetY <= 32 && rawShadow.blur >= 0 && rawShadow.blur <= 32
        ? { color: rawShadow.color, offsetX: rawShadow.offsetX, offsetY: rawShadow.offsetY, blur: rawShadow.blur }
        : undefined;
    const measured = { glyphHeightRatio, rotation: source.rotation, strokeWidth: stroke?.width, shadowBlur: shadow?.blur, shadowOffsetX: shadow?.offsetX, shadowOffsetY: shadow?.offsetY };

    let fontSize = source.style.writingMode === 'vertical-rl' && fontFamily === 'comic-sfx'
        ? FitOverlayTextVertical(lines, box, lineHeight, translation.fontSize)
        : source.style.writingMode === 'horizontal-tb'
            ? FitOverlayTextHorizontal(lines, box, lineHeight, translation.fontSize)
            : translation.fontSize;
    let renderedLines = lines;

    if (isReflowed) {
        const flowText = NormalizeOverlayLines([ SanitizeOverlayText(translation.text ?? '') ], fontFamily, language, source.sourceText)[0] ?? '';
        const flow = fontFamily !== 'latin-dialogue' || /\r\n/u.test(source.sourceText ?? '')
            ? FitOverlayTextIntoBox(flowText, box, Math.max(1, (source.sourceText ?? '').split(/\r?\n/u).filter(line => line.trim()).length), lineHeight)
            : ReflowOverlayDialogue(flowText, box, lineHeight);
        if (flow) {
            renderedLines = flow.lines;
            fontSize = flow.fontSize;
        }
    }

    fontSize = ClampOverlayFontSize(renderedLines, box, lineHeight, fontSize, source.style.writingMode ?? 'horizontal-tb', measured);
    if (fontFamily === 'latin-dialogue') {
        fontSize = FitOverlayTextWidth(renderedLines, box, fontSize);
    }

    const lettering = IsOverlayLettering(source.kind, source.letteringRole);
    return {
        box,
        color,
        direction: translation.direction ?? 'ltr',
        fontFamily,
        glyphAscenderRatio,
        glyphHeightRatio,
        fontSize,
        fontStyle: source.style.fontStyle ?? 'normal',
        fontWeight: fontFamily === 'latin-dialogue' ? 700 : lettering ? 600 : source.style.fontWeight ?? 400,
        language,
        lineHeight,
        lines: renderedLines,
        preserveNaturalGlyphWidth: fontFamily === 'latin-dialogue',
        runtimeFitRequired: lettering || source.kind === 'sign' && source.style.writingMode === 'horizontal-tb' && source.rotation === 0,
        region: source,
        shadow,
        stroke,
        textAlign: source.style.textAlign ?? 'center',
        verticalAlign: isReflowed ? 'middle' : source.style.verticalAlign ?? 'middle',
        writingMode: source.style.writingMode ?? 'horizontal-tb',
    };
}

/**
 * Merges all renderable translations of an overlay with their source regions.
 * @remarks This is the counterpart of the website's `calculateOverlayTextLayout` memo: an empty result disables the overlay entirely.
 */
export function PrepareOverlayTextLayout(overlay: TranslationOverlay): PreparedOverlayRegion[] {
    if (!overlay || overlay.schemaVersion !== 1 || !overlay.translation || overlay.translation.schemaVersion !== 1) {
        return [];
    }
    if (!IsPositiveNumber(overlay.canvas?.width) || !IsPositiveNumber(overlay.canvas?.height) || !OVERLAY_LANGUAGE_PATTERN.test(overlay.translation.language ?? '')) {
        return [];
    }
    const sourceRegions = IndexOverlaySourceRegions(overlay.regions);
    const prepared: PreparedOverlayRegion[] = [];
    const visited = new Set<string>();
    for (const translation of overlay.translation.regions ?? []) {
        if (translation.visible === false || visited.has(translation.regionId) || !OVERLAY_ID_PATTERN.test(translation.regionId)) {
            continue;
        }
        visited.add(translation.regionId);
        const source = sourceRegions.get(translation.regionId);
        if (!source) {
            continue;
        }
        const region = PrepareOverlayRegion(source, translation, overlay.translation.language);
        if (region) {
            prepared.push(region);
        }
    }
    return prepared.sort((left, right) => left.region.readingOrder - right.region.readingOrder);
}

/**
 * The placement of a region which is being fitted within its box.
 */
export type OverlayFitState = { fontSize: number, offsetX: number, offsetY: number, pass: number, status: 'pending' | 'fitted' | 'overflow' };

/**
 * Computes the final font size and offset of a prepared region.
 * @remarks The website measures its SVG elements within the browser to shrink or shift overflowing text. The same decision is taken
 * here analytically, because the website forces the line width of every non-dialogue text via `textLength`, and because its glyph
 * metrics are reproduced by {@link EstimateOverlayWidth} and {@link EstimateComicReliefWidth}.
 */
export function FitPreparedOverlayRegion(region: PreparedOverlayRegion): OverlayFitState {
    let state: OverlayFitState = { fontSize: region.fontSize, offsetX: 0, offsetY: 0, pass: 0, status: region.runtimeFitRequired ? 'pending' : 'fitted' };
    const box = region.box;
    const measured = { glyphHeightRatio: region.glyphHeightRatio, rotation: region.region.rotation, strokeWidth: region.stroke?.width, shadowBlur: region.shadow?.blur, shadowOffsetX: region.shadow?.offsetX, shadowOffsetY: region.shadow?.offsetY };
    const measure = (fontSize: number) => OverlayTextSize(region.lines, fontSize, region.lineHeight, region.writingMode, measured);
    while (state.status === 'pending') {
        if (state.pass >= 12 || state.fontSize <= 0.5) {
            return { ...state, status: 'overflow' };
        }
        const width = box.width - 1;
        const height = box.height - 1;
        const size = width > 0 && height > 0 ? measure(state.fontSize) : null;
        if (!size) {
            return { ...state, status: 'overflow' };
        }
        if (size.width > width + 0.01 || size.height > height + 0.01) {
            const ratio = Math.min(width / size.width, height / size.height);
            let next = Math.floor(state.fontSize * ratio * 1.96) / 2;
            if (next >= state.fontSize) {
                next = state.fontSize - 0.5;
            }
            next = Number(Math.max(0.5, next).toFixed(1));
            if (next >= state.fontSize) {
                return { ...state, status: 'overflow' };
            }
            state = { ...state, fontSize: next, pass: state.pass + 1 };
            continue;
        }
        const shift = MeasureOverlayShift(region, state.fontSize, size);
        if (shift.x === 0 && shift.y === 0) {
            return { ...state, status: 'fitted' };
        }
        state = { ...state, offsetX: state.offsetX + shift.x, offsetY: state.offsetY + shift.y, pass: state.pass + 1 };
    }
    return state;
}

/**
 * Computes the offset which moves the text block of a region into its box (mirrors the box clamping of the website).
 */
function MeasureOverlayShift(region: PreparedOverlayRegion, fontSize: number, size: { width: number, height: number }): { x: number, y: number } {
    const layout = LayoutOverlayTextBlock({ box: region.box, direction: region.direction, fontSize, glyphAscenderRatio: region.glyphAscenderRatio, glyphHeightRatio: region.glyphHeightRatio, lineCount: region.lines.length, lineHeight: region.lineHeight, textAlign: region.textAlign, verticalAlign: region.verticalAlign, writingMode: region.writingMode });
    let left: number;
    let top: number;
    if (region.writingMode === 'vertical-rl') {
        const center = region.box.x + region.box.width / 2;
        left = center - size.width / 2;
        top = region.box.y + region.box.height / 2 - size.height / 2;
    } else {
        const anchor = layout.linePositions[0].x;
        const forward = layout.textAnchor === 'start' && region.direction !== 'rtl' || layout.textAnchor === 'end' && region.direction === 'rtl';
        const backward = layout.textAnchor === 'end' && region.direction !== 'rtl' || layout.textAnchor === 'start' && region.direction === 'rtl';
        left = forward ? anchor : backward ? anchor - size.width : anchor - size.width / 2;
        top = layout.linePositions[0].y - fontSize * region.glyphAscenderRatio;
    }
    const right = left + size.width;
    const bottom = top + size.height;
    const clampX = (value: number, low: number, high: number) => value < low ? low - value : value > high ? high - value : 0;
    return {
        x: clampX(left, region.box.x + 0.5, region.box.x + region.box.width - 0.5) || clampX(right, region.box.x + 0.5, region.box.x + region.box.width - 0.5),
        y: clampX(top, region.box.y + 0.5, region.box.y + region.box.height - 0.5) || clampX(bottom, region.box.y + 0.5, region.box.y + region.box.height - 0.5),
    };
}

/**
 * The web fonts which are loaded from the stylesheet of the website (cached for the lifetime of the application).
 */
let overlayStylesheet: Promise<string | null> | null = null;
const overlayLoadedFonts = new Map<string, Promise<void>>();

/**
 * Requests and concatenates the stylesheets of the website referenced by the page identified through the given {@link referer}.
 * @remarks All relative font URLs are rewritten to absolute URLs, so the individual base URLs are not needed anymore.
 */
async function FetchOverlayStylesheet(referer: string, signal: AbortSignal): Promise<string | null> {
    try {
        const html = await (await Fetch(new Request(referer, { signal }))).text();
        const bases = new Set([ ...html.matchAll(/<link[^>]+rel="stylesheet"[^>]*href="([^"]+)"/gu), ...html.matchAll(/href="([^"]+\.css[^"]*)"[^>]*rel="stylesheet"/gu) ]
            .map(entry => new URL(entry[1], referer).href));
        const sheets = await Promise.all([ ...bases ].map(async base => {
            const text = await (await Fetch(new Request(base, { signal }))).text();
            return text.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gu, (_, quote, target) => `url("${new URL(target, base).href}")`);
        }));
        return sheets.join('\n');
    } catch {
        return null;
    }
}

/**
 * Resolves the font stack of every font key of the website from its stylesheet.
 */
export function ParseOverlayFontStacks(stylesheet: string): { stacks: Map<string, string>, faces: { family: string, source: string, unicodeRange?: string, weight?: string, style?: string }[] } {
    const variables = new Map<string, string>();
    for (const entry of stylesheet.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/gui)) {
        variables.set(entry[1], entry[2].trim());
    }
    const resolve = (value: string) => value.replace(/var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)/gui, (_, name) => variables.get(name) ?? '');
    const stacks = new Map<string, string>();
    for (const entry of stylesheet.matchAll(/\.page-translation-overlay__font--([\w-]+)[^{]*\{[^}]*font-family:\s*([^;}]+)/gui)) {
        // Discard entries whose CSS variable is not defined, otherwise the resulting font stack would be invalid and silently ignored by the canvas
        const stack = resolve(entry[2]).split(',').map(family => family.trim().replace(/\s+/gu, ' ')).filter(Boolean).join(', ');
        if (stack) {
            stacks.set(entry[1], stack);
        }
    }
    const faces: { family: string, source: string, unicodeRange?: string, weight?: string, style?: string }[] = [];
    for (const entry of stylesheet.matchAll(/@font-face\s*\{([^}]+)\}/gui)) {
        const body = entry[1];
        const family = /font-family:\s*([^;]+)/i.exec(body)?.[1]?.trim();
        // The URL of the source is extracted with its optional quotes being discarded, because the
        // stylesheet rewrite already converted all relative URLs to quoted absolute URLs
        const source = /src:\s*([^;]+)/i.exec(body)?.[1];
        const location = source ? /url\(\s*['"]?([^'")]+?)['"]?\s*\)/i.exec(source)?.[1]?.trim() : undefined;
        if (!family || !location) {
            continue;
        }
        faces.push({
            family: family.replace(/^['"]|['"]$/gu, ''),
            source: location,
            unicodeRange: /unicode-range:\s*([^;]+)/i.exec(body)?.[1]?.trim(),
            weight: /font-weight:\s*([^;]+)/i.exec(body)?.[1]?.trim(),
            style: /font-style:\s*([^;]+)/i.exec(body)?.[1]?.trim(),
        });
    }
    return { stacks, faces };
}

/**
 * Splits a CSS font stack into its individual font family names.
 */
function ExtractFontFamilies(stack: string): string[] {
    return [ ...stack.matchAll(/"[^"]+"|'[^']+'|[A-Za-z][\w-]*/gu) ].map(entry => entry[0].replace(/^['"]|['"]$/gu, ''))
        .filter(family => !/^(?:sans-serif|serif|monospace|cursive|fantasy|system-ui|ui-[a-z-]+|inherit|initial)$/iu.test(family));
}

/**
 * Resolves the font stack for each font key used by the given {@link regions} and ensures that their web fonts are loaded.
 * @param referer - The URL of the chapter page which provides the stylesheet of the website
 * @param signal - An abort signal that can be used to cancel the requests
 * @returns A map which translates a font key (e.g. `latin-dialogue`) into a CSS font stack which can be used with `CanvasRenderingContext2D.font`
 * @remarks Every failure falls back to the default font stack of the website, because a missing font must never abort a download.
 */
async function EnsureOverlayFonts(referer: string, regions: PreparedOverlayRegion[], signal: AbortSignal): Promise<Map<string, string>> {
    const stacks = new Map<string, string>();
    const keys = new Set(regions.map(region => region.fontFamily));
    for (const key of keys) {
        stacks.set(key, OVERLAY_FONT_FALLBACKS[key] ?? key);
    }
    if (!keys.size || typeof document === 'undefined' || typeof document.fonts === 'undefined' || typeof FontFace === 'undefined') {
        return stacks;
    }
    overlayStylesheet ??= FetchOverlayStylesheet(referer, signal);
    const stylesheet = await overlayStylesheet;
    if (!stylesheet) {
        overlayStylesheet = null;
        return stacks;
    }
    const { stacks: resolved, faces } = ParseOverlayFontStacks(stylesheet);
    for (const key of keys) {
        const stack = resolved.get(key);
        if (stack) {
            stacks.set(key, stack);
        }
    }
    const families = new Set<string>();
    for (const key of keys) {
        for (const family of ExtractFontFamilies(stacks.get(key) ?? '')) {
            families.add(family);
        }
    }
    const loading = new Map<string, Promise<void>>();
    for (const face of faces) {
        const identifier = `${face.family}|${face.source}`;
        if (!families.has(face.family)) {
            continue;
        }
        // Every face is loaded exactly once, but all concurrent pages await the very same task,
        // otherwise a page could already be painted before a font of another page was registered
        let task = overlayLoadedFonts.get(identifier);
        if (!task) {
            task = (async () => {
                try {
                    const font = new FontFace(face.family, await (await Fetch(new Request(face.source, { signal }))).arrayBuffer(), {
                        unicodeRange: face.unicodeRange,
                        weight: face.weight,
                        style: face.style,
                        display: 'swap',
                    });
                    await font.load();
                    document.fonts.add(font);
                } catch {
                    /* The fallback font stack is used instead, which must never abort the composition of a page. */
                }
            })();
            overlayLoadedFonts.set(identifier, task);
        }
        loading.set(identifier, task);
    }
    await Promise.all(loading.values());
    return stacks;
}

/**
 * Paints the cleanup shapes of a source region, which remove the source text of the region from the page image.
 */
function DrawOverlayCleanup(context: OffscreenCanvasRenderingContext2D, region: OverlaySourceRegion): void {
    const cleanup = region.cleanup;
    if (cleanup.kind !== 'solid' || !IsValidOverlayColor(cleanup.color)) {
        return;
    }
    const shape = cleanup.shape;
    context.save();
    context.fillStyle = cleanup.color;
    context.beginPath();
    if (shape.kind === 'ellipse') {
        context.ellipse(shape.cx, shape.cy, shape.rx, shape.ry, 0, 0, Math.PI * 2);
    } else if (shape.kind === 'rounded-rect') {
        const radius = Math.min(shape.radius, shape.width / 2, shape.height / 2);
        context.moveTo(shape.x + radius, shape.y);
        context.lineTo(shape.x + shape.width - radius, shape.y);
        context.quadraticCurveTo(shape.x + shape.width, shape.y, shape.x + shape.width, shape.y + radius);
        context.lineTo(shape.x + shape.width, shape.y + shape.height - radius);
        context.quadraticCurveTo(shape.x + shape.width, shape.y + shape.height, shape.x + shape.width - radius, shape.y + shape.height);
        context.lineTo(shape.x + radius, shape.y + shape.height);
        context.quadraticCurveTo(shape.x, shape.y + shape.height, shape.x, shape.y + shape.height - radius);
        context.lineTo(shape.x, shape.y + radius);
        context.quadraticCurveTo(shape.x, shape.y, shape.x + radius, shape.y);
    } else {
        shape.points.forEach((point, index) => index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y));
    }
    context.closePath();
    context.fill();
    context.restore();
}

/**
 * Draws a single line of a vertical writing mode (one character per row, centered on the position of its column).
 */
function DrawOverlayVerticalLine(context: OffscreenCanvasRenderingContext2D, line: string, position: { x: number, y: number }, fontSize: number): void {
    const characters = Array.from(line);
    const start = position.y - (characters.length - 1) * fontSize / 2;
    const align = context.textAlign;
    const baseline = context.textBaseline;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    characters.forEach((character, index) => context.fillText(character, position.x, start + index * fontSize));
    context.textAlign = align;
    context.textBaseline = baseline;
}

/**
 * Paints the translated text of a prepared region onto the {@link context}.
 * @remarks The website paints a shadow layer followed by the main text with `paint-order: stroke fill`; the same order is used here.
 */
function DrawOverlayRegion(context: OffscreenCanvasRenderingContext2D, region: PreparedOverlayRegion, fonts: Map<string, string>): void {
    const fit = FitPreparedOverlayRegion(region);
    if (fit.status !== 'fitted') {
        return;
    }
    const layout = LayoutOverlayTextBlock({ box: region.box, direction: region.direction, fontSize: fit.fontSize, glyphAscenderRatio: region.glyphAscenderRatio, glyphHeightRatio: region.glyphHeightRatio, lineCount: region.lines.length, lineHeight: region.lineHeight, textAlign: region.textAlign, verticalAlign: region.verticalAlign, writingMode: region.writingMode });
    context.save();
    if (fit.offsetX !== 0 || fit.offsetY !== 0) {
        context.translate(fit.offsetX, fit.offsetY);
    }
    const rotation = region.region.rotation ?? 0;
    if (rotation !== 0) {
        const centerX = region.box.x + region.box.width / 2;
        const centerY = region.box.y + region.box.height / 2;
        context.translate(centerX, centerY);
        context.rotate(rotation * Math.PI / 180);
        context.translate(-centerX, -centerY);
    }
    context.font = `${region.fontStyle} ${region.fontWeight} ${fit.fontSize}px ${fonts.get(region.fontFamily) ?? OVERLAY_FONT_FALLBACKS[region.fontFamily] ?? region.fontFamily}`;
    context.direction = region.direction === 'rtl' ? 'rtl' : 'ltr';
    context.textAlign = layout.textAnchor === 'middle' ? 'center' : layout.textAnchor;
    context.textBaseline = layout.dominantBaseline === 'middle' ? 'middle' : 'alphabetic';
    if (region.shadow) {
        context.shadowColor = region.shadow.color;
        context.shadowBlur = region.shadow.blur;
        context.shadowOffsetX = region.shadow.offsetX;
        context.shadowOffsetY = region.shadow.offsetY;
    }
    context.fillStyle = region.color;
    region.lines.forEach((line, index) => {
        const position = layout.linePositions[index];
        if (!position) {
            return;
        }
        if (region.writingMode === 'vertical-rl') {
            DrawOverlayVerticalLine(context, line, position, fit.fontSize);
            return;
        }
        if (region.stroke) {
            context.strokeStyle = region.stroke.color;
            context.lineWidth = region.stroke.width;
        }
        if (region.preserveNaturalGlyphWidth) {
            if (region.stroke) {
                context.strokeText(line, position.x, position.y);
            }
            context.fillText(line, position.x, position.y);
            return;
        }
        const target = EstimateOverlayWidth(line) * fit.fontSize;
        const natural = context.measureText(line).width;
        if (natural <= 0 || target <= 0) {
            return;
        }
        context.save();
        context.translate(position.x, position.y);
        context.scale(target / natural, 1);
        if (region.stroke) {
            context.strokeText(line, 0, 0);
        }
        context.fillText(line, 0, 0);
        context.restore();
    });
    context.restore();
}

/**
 * Renders the page image of the website, its patch layer and the translated text into a single image.
 * @param image - The untranslated page image as served through `page.url`
 * @param overlay - The translation overlay of the page
 * @param referer - The URL of the chapter page which provides the assets and the stylesheet of the website
 * @param signal - An abort signal that can be used to cancel the requests
 * @returns The composed image or `null` when the overlay cannot be rendered, in which case the untranslated image must be used
 */
export async function ComposeTranslatedPage(image: Blob, overlay: TranslationOverlay, referer: string, origin: string, signal: AbortSignal): Promise<Blob | null> {
    const regions = PrepareOverlayTextLayout(overlay);
    if (regions.length === 0 || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') {
        return null;
    }
    const usesPatchLayer = regions.some(region => region.region.cleanup.kind === 'patch');
    const patchLayerUrl = ResolveOverlayAssetUrl(overlay.cleanLayerUrl, origin);
    if (usesPatchLayer && !patchLayerUrl) {
        return null;
    }
    const canvas = new OffscreenCanvas(overlay.canvas.width, overlay.canvas.height);
    const context = canvas.getContext('2d');
    if (!context) {
        return null;
    }
    const bitmap = await createImageBitmap(image);
    context.drawImage(bitmap, 0, 0, overlay.canvas.width, overlay.canvas.height);
    bitmap.close();
    for (const region of regions) {
        DrawOverlayCleanup(context, region.region);
    }
    if (usesPatchLayer && patchLayerUrl) {
        const patch = await createImageBitmap(await (await Fetch(new Request(patchLayerUrl, { signal, headers: { 'Referer': referer } }))).blob());
        context.drawImage(patch, 0, 0, overlay.canvas.width, overlay.canvas.height);
        patch.close();
    }
    const fonts = await EnsureOverlayFonts(referer, regions, signal);
    for (const region of regions) {
        DrawOverlayRegion(context, region, fonts);
    }
    return canvas.convertToBlob({ type: 'image/webp', quality: 0.9 });
}

export default class extends DecoratableMangaScraper {

    public constructor() {
        super('komascans', 'KomaScans', 'https://komascans.com', Tags.Media.Manhwa, Tags.Language.Multilingual, Tags.Source.Aggregator);
    }

    public override get Icon() {
        return icon;
    }

    /**
     * The website serves its content through plain requests, hence no browser window must be opened upfront.
     */
    public override Initialize(): Promise<void> {
        return Promise.resolve();
    }

    public override ValidateMangaURL(url: string): boolean {
        return new RegExpSafe(`^${this.URI.origin}/[a-z]{2}(?:-[a-z]{2})?/(?:series|read)/[^/?#]+(?:/[^/?#]+)?/?(?:[?#].*)?$`, 'i').test(url);
    }

    /**
     * Restores the language tag of a series when its entry is re-created from the local media list cache (e.g. on
     * startup), so that the frontend is able to display the language of each locale variant of a series.
     * @param identifier - The identifier of a series (e.g. `/fr/series/the-greatest-estate-developer`)
     */
    public override GetMangaTags(identifier: string): Tag[] {
        return [ MapLanguageTag(identifier) ];
    }

    public override async FetchManga(provider: MangaPlugin, url: string): Promise<Manga> {
        const identifier = ResolveSeriesIdentifier(url);
        if (!identifier) {
            throw new Exception(R.Plugin_Common_MangaIndex_NotSupported);
        }
        const series = await FetchNextJS<HydratedSeries>(new Request(new URL(identifier, this.URI)), data => 'seriesTitle' in data && 'knownChapters' in data);
        const slug = identifier.split('/').at(-1) ?? '';
        return new Manga(this, provider, identifier, series?.seriesTitle || SeriesTitleFromSlug(slug), MapLanguageTag(identifier));
    }

    public override async FetchMangas(provider: MangaPlugin): Promise<Manga[]> {
        const documents = await this.FetchSitemapDocuments(/\/series-[a-z0-9-]+\.xml$/);
        const identifiers = new Set<string>();
        for (const document of documents) {
            for (const [ , block ] of document.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
                const location = /<loc>([^<]+)<\/loc>/.exec(block)?.[1];
                const identifier = location ? ResolveSeriesIdentifier(location) : null;
                if (identifier) {
                    identifiers.add(identifier);
                }
            }
        }
        return [ ...identifiers ].map(identifier => new Manga(this, provider, identifier, SeriesTitleFromSlug(identifier.split('/').at(-1) ?? ''), MapLanguageTag(identifier)))
            .sort((left, right) => left.Title.localeCompare(right.Title));
    }

    public override async FetchChapters(manga: Manga): Promise<Chapter[]> {
        const series = await FetchNextJS<HydratedSeries>(new Request(new URL(manga.Identifier, this.URI)), data => 'knownChapters' in data && Array.isArray(data.knownChapters));
        if (!series) {
            throw new Exception(R.Plugin_Common_Chapter_UnavailableError);
        }

        const firstChapter = series.firstChapter ?? null;
        const metadata = new Map<string, HydratedChapter>(series.knownChapters.map(chapter => [ chapter.slug, chapter ]));
        if (firstChapter) {
            metadata.set(firstChapter.slug, firstChapter);
        }
        if (series.latestChapter) {
            metadata.set(series.latestChapter.slug, series.latestChapter);
        }

        /*
         * The website hydrates at most KNOWN_CHAPTERS_LIMIT chapters per series page (most recent ones). Whenever the
         * earliest chapter of the series is missing from this partial list, the list is considered truncated and the
         * remaining (older) chapters are gathered from the sitemaps instead.
         */
        const isTruncated = firstChapter !== null && series.knownChapters.length >= KNOWN_CHAPTERS_LIMIT && !series.knownChapters.some(chapter => chapter.slug === firstChapter.slug);
        const identifiers = isTruncated
            ? await this.FetchChapterIdentifiers(manga.Identifier)
            : new Set(series.knownChapters.map(chapter => chapter.slug));

        const path = manga.Identifier.split('/');
        const locale = path[1];
        const seriesSlug = path.at(-1);
        return [ ...identifiers ].reduce((chapters: { number: number, chapter: Chapter }[], slug) => {
            const chapter = metadata.get(slug);
            const number = chapter ? chapter.number : MapChapterNumber(slug);
            const title = LocalizeChapterWord(chapter ? MapChapterTitle(chapter) : ChapterTitleFromSlug(slug), locale);
            const published = chapter && chapter.publishedAt ? new Date(chapter.publishedAt) : null;
            const identifier = `/${locale}/read/${seriesSlug}/${slug}`;
            const value = published && !Number.isNaN(published.getTime())
                ? new Chapter(this, manga, identifier, title, published)
                : new Chapter(this, manga, identifier, title);
            chapters.push({ number: Number.isFinite(number) ? number : Number.NaN, chapter: value });
            return chapters;
        }, []).sort((left, right) => (right.number || 0) - (left.number || 0)).map(entry => entry.chapter);
    }

    public override async FetchPages(chapter: Chapter): Promise<Page[]> {
        const pages = await FetchNextJS<HydratedPages>(new Request(new URL(chapter.Identifier, this.URI)), data => 'pages' in data && Array.isArray(data.pages) && data.pages.length > 0);
        if (!pages) {
            throw new Exception(R.Plugin_Common_Chapter_InvalidError);
        }
        const referer = new URL(chapter.Identifier, this.URI).href;
        return pages.pages
            .slice()
            .sort((left, right) => left.position - right.position)
            .map(page => page.translationOverlay
                ? new Page(this, chapter, new URL(page.url), { Referer: referer, overlay: page.translationOverlay })
                : new Page(this, chapter, new URL(page.url), { Referer: referer }));
    }

    /**
     * Returns the image of the given {@link page} with the translation overlay of the website applied to it.
     * @remarks The website never provides a translated image: the translation is rendered within the browser on top of the
     * untranslated page image. Whenever the composition fails, the untranslated image is returned instead of aborting the download.
     */
    public override async FetchImage(page: Page, priority: Priority, signal: AbortSignal): Promise<Blob> {
        const image = await Common.FetchImageAjax.call(this, page, priority, signal, true);
        const overlay = page.Parameters?.overlay as unknown as TranslationOverlay | undefined;
        if (!overlay) {
            return image;
        }
        try {
            return await ComposeTranslatedPage(image, overlay, page.Parameters?.Referer ?? this.URI.href, this.URI.origin, signal) ?? image;
        } catch {
            return image;
        }
    }

    /**
     * Gathers the slugs of all chapters of the series identified by the given {@link identifier} from the sitemaps of the website.
     * @param identifier - The path of the series page (e.g. `/en/series/nano-machine`)
     * @remarks The series pages only contain the {@link KNOWN_CHAPTERS_LIMIT} most recent chapters, while the sitemaps are the
     * only complete source for the chapter list. English chapters are spread across multiple sitemap documents.
     */
    private async FetchChapterIdentifiers(identifier: string): Promise<Set<string>> {
        const path = identifier.split('/');
        const locale = path[1];
        const seriesSlug = path.at(-1);
        const documents = await this.FetchSitemapDocuments(locale === 'en' ? /\/chapters-\d+\.xml$/ : new RegExp(`/chapters-${locale}-\\d+\\.xml$`));
        const needle = `/${locale}/read/${seriesSlug}/`;
        const identifiers = new Set<string>();
        for (const document of documents) {
            if (document.includes(needle)) {
                for (const segment of document.split(needle).slice(1)) {
                    const slug = segment.split('<', 1)[0];
                    if (slug) {
                        identifiers.add(slug);
                    }
                }
            }
        }
        return identifiers;
    }

    /**
     * Requests the content of all sitemap documents of the website matching the given {@link pattern}.
     * @param pattern - A pattern which is matched against the endpoint URL of each sitemap document
     * @returns The content of each matching sitemap document
     * @remarks The documents are requested in small batches to limit the peak memory usage, as a single document may exceed 6 MB.
     */
    private async FetchSitemapDocuments(pattern: RegExp): Promise<string[]> {
        const index = await (await Fetch(new Request(new URL('/sitemap.xml', this.URI)))).text();
        const endpoints = [ ...index.matchAll(/<loc>([^<]+)<\/loc>/g) ].map(entry => entry[1]).filter(endpoint => pattern.test(endpoint));
        const documents: string[] = [];
        for (let position = 0; position < endpoints.length; position += SITEMAP_REQUEST_BATCH_SIZE) {
            const batch = endpoints.slice(position, position + SITEMAP_REQUEST_BATCH_SIZE);
            documents.push(...await Promise.all(batch.map(async endpoint => (await Fetch(new Request(endpoint))).text())));
        }
        return documents;
    }
}
