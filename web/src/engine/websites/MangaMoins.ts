import { Tags } from '../Tags';
import icon from './MangaMoins.webp';
import { FetchWindowScript } from '../platform/FetchProvider';
import { DecoratableMangaScraper, type MangaPlugin, Manga, Chapter, Page } from '../providers/MangaPlugin';
import { AddStalledChallengeReload } from '../platform/ChallengeReload';
import * as Common from './decorators/Common';

AddStalledChallengeReload(/^https:\/\/(?:www\.)?mangamoins\.com/);

type APIManga = {
    mangaSlug: string;
    title: string;
    cover: string;
};

type APIChapter = {
    slug: string;
    num: number;
    title: string;
};

/*
 * API shapes verified live via CDP probe (24 Aug 2026).
 * The API requires the Cloudflare session cookie, so every call runs inside a
 * real window (FetchWindowScript) where the cf_clearance cookie is present.
 */
@Common.ImageAjax()
export default class extends DecoratableMangaScraper {

    public constructor() {
        super('mangamoins', 'MangaMoins', 'https://mangamoins.com', Tags.Media.Manga, Tags.Media.Manhwa, Tags.Media.Manhua, Tags.Language.French, Tags.Source.Aggregator);
    }

    public override get Icon() {
        return icon;
    }

    public override ValidateMangaURL(url: string): boolean {
        return /^https:\/\/mangamoins\.com\/manga\/[^/]+/.test(url);
    }

    public override async FetchManga(provider: MangaPlugin, url: string): Promise<Manga> {
        const match = url.match(/\/manga\/([^/?#]+)/);
        if (!match) throw new Error(`Invalid MangaMoins URL: ${url}`);
        const slug = match[1];
        const script = `
            (async () => {
                const res = await fetch('/api/v1/manga?manga=' + encodeURIComponent('${slug}'));
                if (!res.ok) throw new Error('MangaMoins API ' + res.status);
                const json = await res.json();
                return { title: json.info?.title ?? '', slug: '${slug}' };
            })()
        `;
        const data = await FetchWindowScript<{ title: string; slug: string }>(new Request(new URL(`/manga/${slug}`, this.URI)), script);
        return new Manga(this, provider, `/manga/${data.slug}`, data.title);
    }

    public override async FetchMangas(provider: MangaPlugin): Promise<Manga[]> {
        const script = `
            (async () => {
                const seen = new Set();
                const result = [];
                for (let page = 1; page <= 50; page++) {
                    const res = await fetch('/api/v1/mangas?page=' + page + '&limit=100');
                    if (!res.ok) break;
                    const json = await res.json();
                    const items = json.data ?? [];
                    for (const item of items) {
                        const slug = item.mangaSlug;
                        const title = item.title;
                        if (!slug || !title || seen.has(slug)) continue;
                        seen.add(slug);
                        result.push({ mangaSlug: slug, title: title, cover: item.cover ?? '' });
                    }
                    if (items.length === 0 || json.total && result.length >= json.total) break;
                }
                return result;
            })()
        `;
        const entries = await FetchWindowScript<APIManga[]>(new Request(new URL('/explorer', this.URI)), script, 750, 180_000);
        return entries.map(({ mangaSlug, title }) => new Manga(this, provider, `/manga/${mangaSlug}`, title));
    }

    public override async FetchChapters(manga: Manga): Promise<Chapter[]> {
        const slug = manga.Identifier.match(/\/manga\/([^/?#]+)/)?.[1] ?? '';
        const script = `
            (async () => {
                const res = await fetch('/api/v1/manga?manga=' + encodeURIComponent('${slug}'));
                if (!res.ok) throw new Error('MangaMoins API ' + res.status);
                const json = await res.json();
                return (json.chapters ?? []).map(c => ({ slug: c.slug, num: c.num, title: c.title ?? '' }));
            })()
        `;
        const chapters = await FetchWindowScript<APIChapter[]>(new Request(new URL(manga.Identifier, this.URI)), script);
        return chapters.map(({ slug, num, title }) =>
            new Chapter(this, manga, slug, [`Ch. ${num}`, title].joinTitleSegments())
        );
    }

    public override async FetchPages(chapter: Chapter): Promise<Page[]> {
        const script = `
            (async () => {
                const res = await fetch('/api/v1/scan?slug=' + encodeURIComponent('${chapter.Identifier}'));
                if (!res.ok) throw new Error('MangaMoins API ' + res.status);
                const json = await res.json();
                const segment = (json.pagesBaseUrl ?? '').split('/').filter(Boolean).pop() ?? '';
                const hash = (segment.match(/[0-9a-f]{12,}/) ?? [null])[0];
                if (!hash) return [];
                const pages = [];
                for (let n = 1; n <= (json.pageNumbers ?? 0); n++) {
                    pages.push('https://mangamoinsscans.mangamoins.com/' + hash + '/' + String(n).padStart(2, '0') + '.webp');
                }
                return pages;
            })()
        `;
        const images = await FetchWindowScript<string[]>(new Request(new URL(`/scan/${chapter.Identifier}`, this.URI)), script);
        return images.map(image => new Page(this, chapter, new URL(image), { Referer: this.URI.href }));
    }
}
