import { Tags } from '../Tags';
import icon from './Comix.webp';
import { FetchWindowScript } from '../platform/FetchProvider';
import { DecoratableMangaScraper, type MangaPlugin, Manga, Chapter, Page } from '../providers/MangaPlugin';
import * as Common from './decorators/Common';
import { RateLimit } from '../taskpool/RateLimit';

type APIChapter = {
    id: number;
    number: number;
    name: string;
    group: string | null;
};

/**
 * Discover the site's bundled axios instance and make it available as `__axios`.
 * The site encrypts its API responses (e.g. `{"e": "<base64>"}`) and decrypts them
 * inside its own axios interceptors, so requests must go through the page's axios
 * rather than a plain `fetch`.
 */
const ScriptAxios = `
    const __envURL = performance.getEntriesByType('resource').map(entry => entry.name).find(url => url.includes('/env-'));
    if (!__envURL) throw new Error('Comix: env chunk not loaded');
    const __envModule = await import(__envURL);
    const __axios = __envModule.x ?? __envModule.default?.x;
    if (typeof __axios !== 'function') throw new Error('Comix: axios not found in env chunk');
`;

const ScriptChapters = `
    (async () => {
        ${ScriptAxios}
        const hid = location.pathname.split('/').filter(Boolean)[1].split('-')[0];
        const chapters = [];
        for (let page = 1; ; page++) {
            const { data } = await __axios.get('/manga/' + hid + '/chapters', { params: { page, limit: 100, 'order[number]': 'desc' } });
            for (const chapter of data.items ?? []) {
                chapters.push({ id: chapter.id, number: chapter.number, name: chapter.name ?? '', group: chapter.group?.name ?? null });
            }
            if (!data.meta?.hasNext) break;
        }
        return chapters;
    })()
`;

const ScriptPages = `
    (async () => {
        ${ScriptAxios}
        const id = location.pathname.split('/').filter(Boolean).pop().split('-')[0];
        const { data } = await __axios.get('/chapters/' + id);
        return (data.pages?.items ?? []).map(page => page.url).filter(Boolean);
    })()
`;

const ScriptMangas = `
    (async () => {
        ${ScriptAxios}
        const fetchPage = async page => {
            for (let attempt = 0; attempt < 3; attempt++) {
                if (attempt > 0) await new Promise(done => setTimeout(done, 1000 * attempt));
                try {
                    const { data } = await __axios.get('/manga', { params: { page, limit: 100, 'order[chapter_updated_at]': 'desc' } });
                    return data;
                } catch { /* retry */ }
            }
            return null;
        };
        const result = [];
        const seen = new Set();
        const collect = data => {
            for (const item of data.items ?? []) {
                const id = String(item.url ?? '').split(/[?#]/)[0].trim();
                const title = String(item.title ?? '').replace(/\\s+/g, ' ').trim();
                if (!id || !title || seen.has(id)) continue;
                seen.add(id);
                result.push({ id, title });
            }
        };
        const first = await fetchPage(1);
        if (!first) return [];
        collect(first);
        const lastPage = Math.min(first.meta?.lastPage ?? 1, 2000);
        for (let page = 2; page <= lastPage; page += 6) {
            const pages = [];
            for (let i = 0; i < 6 && page + i <= lastPage; i++) pages.push(page + i);
            const responses = await Promise.all(pages.map(fetchPage));
            for (const data of responses) {
                if (data) collect(data);
            }
        }
        return result;
    })()
`;

@Common.MangaCSS(/^{origin}\/title\/[^/]+$/, 'meta[property="og:title"]')
@Common.ImageAjax()
export default class extends DecoratableMangaScraper {

    public constructor() {
        super('comix', 'Comix', 'https://comix.to', Tags.Media.Manga, Tags.Media.Manhwa, Tags.Media.Manhua, Tags.Language.English, Tags.Source.Aggregator);
        this.imageTaskPool.RateLimit = new RateLimit(4, 1);
    }

    public override get Icon() {
        return icon;
    }

    public override async FetchMangas(provider: MangaPlugin): Promise<Manga[]> {
        const entries = await FetchWindowScript<{ id: string; title: string }[]>(new Request(new URL('/browse', this.URI)), ScriptMangas, 750, 180_000);
        return entries.map(({ id, title }) => new Manga(this, provider, id, title));
    }

    public override async FetchChapters(manga: Manga): Promise<Chapter[]> {
        const chapters = await FetchWindowScript<APIChapter[]>(new Request(new URL(manga.Identifier, this.URI)), ScriptChapters);
        return chapters.map(({ id, number, name, group }) => {
            const title = [number, name && `- ${name}`, group && `[${group}]`].joinTitleSegments();
            return new Chapter(this, manga, `${manga.Identifier}/${id}-chapter-${number}`, title);
        });
    }

    public override async FetchPages(chapter: Chapter): Promise<Page[]> {
        const images = await FetchWindowScript<string[]>(new Request(new URL(chapter.Identifier, this.URI)), ScriptPages);
        return images.map(image => new Page(this, chapter, new URL(image), { Referer: this.URI.href }));
    }
}
