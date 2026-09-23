import { Tags } from '../Tags';
import icon from './MangaNova.webp';
import { FetchWindowScript } from '../platform/FetchProvider';
import { DecoratableMangaScraper, Manga, Chapter, Page, type MangaPlugin } from '../providers/MangaPlugin';
import * as Common from './decorators/Common';

type MangaNovaEntry = {
    slug: string;
    title: string;
};

@Common.ImageAjax()
export default class extends DecoratableMangaScraper {

    public constructor() {
        super('manganova', 'Manga Nova', 'https://www.manga-nova.com', Tags.Language.French, Tags.Media.Manga, Tags.Source.Aggregator);
    }

    public override get Icon() {
        return icon;
    }

    public override ValidateMangaURL(url: string): boolean {
        try {
            const uri = new URL(url);
            return uri.origin === this.URI.origin && /^\/manga\/[^/]+\/?$/.test(uri.pathname);
        } catch {
            return false;
        }
    }

    public override async FetchMangas(provider: MangaPlugin): Promise<Manga[]> {
        const entries = await FetchWindowScript<MangaNovaEntry[]>(
            new Request(new URL('/catalogue', this.URI)),
            `
                new Promise(resolve => {
                    const normalize = value => String(value ?? '').replace(/\\s+/g, ' ').trim();
                    const collect = () => {
                        const result = [];
                        const seen = new Set();
                        for (const anchor of document.querySelectorAll('a[href]')) {
                            let uri;
                            try {
                                uri = new URL(anchor.href, location.origin);
                            } catch {
                                continue;
                            }
                            const match = uri.pathname.match(/^\\/manga\\/([^/]+)\\/?$/);
                            if (!match || seen.has(match[1])) continue;
                            const card = anchor.closest('article, li, [class*="card"], [class*="manga"], [class*="series"]');
                            const title = normalize(
                                anchor.querySelector('h1, h2, h3, h4, [class*="title"]')?.textContent
                                || card?.querySelector('h1, h2, h3, h4, [class*="title"]')?.textContent
                                || anchor.getAttribute('title')
                                || anchor.textContent
                            );
                            if (!title || title.length < 2) continue;
                            seen.add(match[1]);
                            result.push({ slug: match[1], title });
                        }
                        return result;
                    };
                    const started = Date.now();
                    const poll = () => {
                        const result = collect();
                        if (result.length > 0 || Date.now() - started > 15000) resolve(result);
                        else setTimeout(poll, 250);
                    };
                    poll();
                })
            `,
            500,
            60_000
        );
        return entries.map(({ slug, title }) => new Manga(this, provider, slug, title));
    }

    public override async FetchManga(provider: MangaPlugin, url: string): Promise<Manga> {
        const uri = new URL(url);
        const slug = uri.pathname.match(/^\/manga\/([^/]+)\/?$/)?.[1];
        if (!slug) throw new Error(`Invalid Manga Nova URL: ${url}`);
        const title = await FetchWindowScript<string>(
            new Request(uri),
            `
                (() => {
                    const normalize = value => String(value ?? '').replace(/\\s+/g, ' ').trim();
                    return normalize(
                        document.querySelector('meta[property="og:title"]')?.getAttribute('content')
                        || document.title
                    ).replace(/\\s*[-|—]\\s*Manga Nova\\s*$/i, '').trim();
                })()
            `,
            500
        );
        return new Manga(this, provider, slug, title || slug.replace(/[-_]+/g, ' '));
    }

    public override async FetchChapters(manga: Manga): Promise<Chapter[]> {
        const chapters = await FetchWindowScript<{ id: string; title: string }[]>(
            new Request(new URL(`/manga/${manga.Identifier}`, this.URI)),
            `
                (() => {
                    const normalize = value => String(value ?? '').replace(/\\s+/g, ' ').trim();
                    const result = [];
                    const seen = new Set();
                    for (const anchor of document.querySelectorAll('a[href]')) {
                        let uri;
                        try {
                            uri = new URL(anchor.href, location.origin);
                        } catch {
                            continue;
                        }
                        const match = uri.pathname.match(/^\\/lecture-en-ligne\\/([^/]+)\\/chapitre\\/([^/]+)\\/?$/);
                        if (!match || match[1] !== '${manga.Identifier}' || seen.has(uri.pathname)) continue;
                        const number = match[2];
                        const title = 'Chapitre ' + number;
                        seen.add(uri.pathname);
                        result.push({ id: uri.pathname, title });
                    }
                    return result.sort((left, right) => {
                        const a = Number.parseFloat(left.id.match(/([^/]+)$/)?.[1] ?? '') || 0;
                        const b = Number.parseFloat(right.id.match(/([^/]+)$/)?.[1] ?? '') || 0;
                        return b - a;
                    });
                })()
            `,
            500
        );
        return chapters.map(({ id, title }) => new Chapter(this, manga, id, title));
    }

    public override async FetchPages(chapter: Chapter): Promise<Page[]> {
        const images = await FetchWindowScript<string[]>(
            new Request(new URL(chapter.Identifier, this.URI)),
            `
                (() => {
                    const chapterNumber = decodeURIComponent(location.pathname.split('/').filter(Boolean).at(-1) || '');
                    const isCandidate = value => {
                        if (!value || value.startsWith('data:')) return false;
                        try {
                            const uri = new URL(value);
                            return uri.hostname === 'cdn.manga-nova.com'
                                && uri.pathname.includes('/chapitres/' + chapterNumber + '/')
                                && !uri.pathname.endsWith('/preview.jpg')
                                && /\\.(?:avif|gif|jpe?g|png|webp)$/i.test(uri.pathname);
                        } catch {
                            return false;
                        }
                    };
                    const seen = new Set();
                    const result = [];
                    const add = value => {
                        if (!isCandidate(value) || seen.has(value)) return;
                        seen.add(value);
                        result.push(value);
                    };

                    // Manga Nova is a Next.js app. The reader initially renders only a
                    // handful of lazy images, while the complete chapter image list lives
                    // in the RSC hydration payload as an images array.
                    for (const script of document.querySelectorAll('script:not([src])')) {
                        const text = script.textContent || '';
                        if (!text.includes('images')) continue;
                        for (const part of text.split('https://').slice(1)) {
                            const end = part.search(/["\\\\]/);
                            add('https://' + (end >= 0 ? part.slice(0, end) : part));
                        }
                    }

                    // Fallback for a future server-rendered reader format.
                    if (result.length === 0) {
                        for (const element of document.querySelectorAll('img, source')) {
                            for (const value of [
                                element.getAttribute('src'),
                                element.getAttribute('data-src'),
                                element.getAttribute('data-original'),
                                element.getAttribute('data-lazy-src'),
                                element.getAttribute('srcset')?.split(',')[0]?.trim().split(' ')[0]
                            ]) {
                                try {
                                    add(new URL(value, location.href).href);
                                } catch {
                                    // Ignore malformed image attributes.
                                }
                            }
                        }
                    }
                    return result;
                })()
            `,
            500,
            45_000
        );
        return images.map(image => new Page(this, chapter, new URL(image), { Referer: this.URI.href }));
    }
}
