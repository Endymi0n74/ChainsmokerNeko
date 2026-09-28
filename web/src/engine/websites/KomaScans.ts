import { Tags, type Tag } from '../Tags';
import icon from './KomaScans.webp';
import { Fetch, FetchNextJS } from '../platform/FetchProvider';
import { DecoratableMangaScraper, type MangaPlugin, Manga, Chapter, Page } from '../providers/MangaPlugin';
import { Exception } from '../Error';
import { WebsiteResourceKey as R } from '../../i18n/ILocale';
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

@Common.ImageAjax(true)
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
            const title = chapter ? MapChapterTitle(chapter) : ChapterTitleFromSlug(slug);
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
        return pages.pages
            .slice()
            .sort((left, right) => left.position - right.position)
            .map(page => new Page(this, chapter, new URL(page.url)));
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
