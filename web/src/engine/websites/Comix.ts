import { Tags } from '../Tags';
import icon from './Comix.webp';
import { Fetch, FetchWindowScript } from '../platform/FetchProvider';
import type { Priority } from '../taskpool/TaskPool';
import { DecoratableMangaScraper, type MangaPlugin, Manga, Chapter, Page } from '../providers/MangaPlugin';
import * as Common from './decorators/Common';
import { RateLimit } from '../taskpool/RateLimit';
import { AddStalledChallengeReload } from '../platform/ChallengeReload';

type APIChapter = {
    id: number;
    number: number;
    name: string;
    group: string | null;
};

/**
 * Discover the site's bundled HTTP client and expose it as `__get(url, config)`.
 * The site encrypts its API responses (e.g. `{"e": "<base64>"}`) and decrypts them
 * inside its own axios interceptors, so requests must go through the page's client
 * rather than a plain `fetch`. The client is picked by shape (the bag of HTTP verbs,
 * optionally a raw axios instance) instead of by export name: those names are rebuilt
 * on every deploy of the site. Depending on the build, `get` resolves either to the
 * full axios response or directly to the payload, hence the adaptive unwrapping.
 */
const ScriptAxios = `
    const __envURL = performance.getEntriesByType('resource').map(entry => entry.name).find(url => url.includes('/env-'));
    if (!__envURL) throw new Error('Comix: env chunk not loaded');
    const __envModule = await import(__envURL);
    const __values = [__envModule, __envModule.default]
        .filter(chunk => chunk && typeof chunk === 'object')
        .flatMap(chunk => Object.values(chunk));
    const __isHTTPClient = client => client && typeof client === 'object'
        && ['get', 'post', 'put', 'patch', 'delete'].every(method => typeof client[method] === 'function');
    const __isAxiosInstance = client => client && typeof client === 'object'
        && typeof client.request === 'function' && !!client.interceptors;
    const __client = __values.find(__isHTTPClient) ?? __values.find(__isAxiosInstance);
    if (!__client) throw new Error('Comix: http client not found in env chunk');
    const __get = async (url, config) => {
        const response = await __client.get(url, config);
        const isAxiosResponse = response && typeof response === 'object'
            && typeof response.status === 'number' && 'headers' in response && 'config' in response;
        return isAxiosResponse ? response.data : response;
    };
`;

const ScriptChapters = `
    (async () => {
        ${ScriptAxios}
        const hid = location.pathname.split('/').filter(Boolean)[1].split('-')[0];
        const chapters = [];
        for (let page = 1; ; page++) {
            const data = await __get('/manga/' + hid + '/chapters', { params: { page, limit: 100, 'order[number]': 'desc' } });
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
        const data = await __get('/chapters/' + id);
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
                    const data = await __get('/manga', { params: { page, limit: 100, 'order[chapter_updated_at]': 'desc' } });
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

AddStalledChallengeReload(/^https:\/\/(?:www\.)?comix\.to/);

@Common.MangaCSS(/^{origin}\/title\/[^/]+$/, 'meta[property="og:title"]')
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
        return images.map(image => new Page(this, chapter, new URL(image)));
    }

    /**
     * The image CDN answers HTTP 403 to any request carrying a non-empty `Referer` (hotlink protection),
     * even when the referer is the image's own origin, so the pages must be requested without any referer,
     * the same way the site's own reader loads them.
     */
    public override async FetchImage(page: Page, priority: Priority, signal: AbortSignal): Promise<Blob> {
        return this.imageTaskPool.Add(async () => {
            const request = new Request(page.Link, { signal, referrerPolicy: 'no-referrer' });
            const response = await Fetch(request);
            return response.blob();
        }, priority, signal);
    }
}
