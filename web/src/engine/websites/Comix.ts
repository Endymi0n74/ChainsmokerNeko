import { Tags } from '../Tags';
import icon from './Comix.webp';
import { Fetch, FetchWindowScript } from '../platform/FetchProvider';
import type { Priority } from '../taskpool/TaskPool';
import { DecoratableMangaScraper, type MangaPlugin, Manga, Chapter, Page } from '../providers/MangaPlugin';
import * as Common from './decorators/Common';
import { RateLimit } from '../taskpool/RateLimit';
import { AddStalledChallengeReload } from '../platform/ChallengeReload';
import { Delay, SetTimeout, ClearTimeout } from '../BackgroundTimers';

type APIChapter = {
    id: number;
    number: number;
    name: string;
    group: string | null;
};

/**
 * Maximum time a single image request may run once the task pool has started it. The
 * download task also bounds the whole page (queue wait included), but that outer budget
 * cannot abort the request itself: without this bound a dead image host keeps the pool
 * workers busy forever and every subsequent download of this website fails as well,
 * long after the host has recovered.
 */
const IMAGE_FETCH_TIMEOUT_MS = 15_000;

/**
 * After an image host failed at the network level, keep it marked as unreachable for this
 * grace period: the pages queued behind the failure then reject immediately (with a clear
 * message) instead of stacking new waits on a host known to be dead, and the cooldown
 * expires by itself so downloads resume as soon as the host recovers.
 */
const IMAGE_HOST_COOLDOWN_MS = 20_000;

/** Image hosts currently marked as unreachable, with the end of their cooldown period. */
const imageHostCooldowns = new Map<string, number>();

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
    const __isHTTPClient = client => client && typeof client === 'object'
        && ['get', 'post', 'put', 'patch', 'delete'].every(method => typeof client[method] === 'function');
    const __isAxiosInstance = client => client && typeof client === 'object'
        && typeof client.request === 'function' && !!client.interceptors;
    const __importClient = async url => {
        try {
            const chunk = await import(url);
            const values = [chunk, chunk.default]
                .filter(part => part && typeof part === 'object')
                .flatMap(part => Object.values(part));
            return values.find(__isHTTPClient) ?? values.find(__isAxiosInstance) ?? null;
        } catch { return null; }
    };
    // The bundler renames its chunks on every deploy (the client once lived in 'env-<hash>.js',
    // it now ships inside 'tmonyg-<hash>.js'), so the URL cannot be recognized by name anymore.
    // Scan the scripts the page has already loaded and keep the one exposing the HTTP verbs
    // (shape), with a raw axios instance as fallback. Importing an already-evaluated module URL
    // returns the cached namespace, so the scan never re-executes a chunk.
    const __scripts = performance.getEntriesByType('resource').map(entry => entry.name).filter(url => url.endsWith('.js'));
    const __envURL = __scripts.find(url => url.includes('/env-'));
    let __client = __envURL ? await __importClient(__envURL) : null;
    for (const url of __scripts) {
        if (__client) break;
        __client = await __importClient(url);
    }
    if (!__client) throw new Error('Comix: http client not found in the loaded scripts');
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
        // The download task starts its per-page budget as soon as the page is launched,
        // queue wait included, while the pool only starts the requests one by one. A
        // throttle of 4 requests/s starved every chapter beyond ~57 pages (their tail died
        // in the queue without ever being requested); 20 requests/s keeps the pool workers
        // (4 concurrent requests, unchanged) busy enough for the largest chapters.
        this.imageTaskPool.RateLimit = new RateLimit(20, 1);
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
     *
     * The CDN also rotates throwaway domains: a host can drop without notice (observed on
     * `*.kkplayer.wtf`). Each request is therefore bounded on its own (see IMAGE_FETCH_TIMEOUT_MS)
     * so a dead host cannot pin the pool workers, and a host that failed at the network level is
     * put in cooldown (see IMAGE_HOST_COOLDOWN_MS) so the remaining pages fail fast instead of
     * rebuilding the queue that made downloads unreliable in the first place.
     */
    public override async FetchImage(page: Page, priority: Priority, signal: AbortSignal): Promise<Blob> {
        // NOTE: the test fixtures invoke the page fetch with a null signal: treat it as "no cancellation".
        const cancellation: AbortSignal | null = signal;
        return this.imageTaskPool.Add(async () => {
            const host = page.Link.host;
            const cooldownUntil = imageHostCooldowns.get(host) ?? 0;
            if (cooldownUntil > Date.now()) {
                throw new Error(`Image host unreachable: ${host}`);
            }
            let lastError: unknown;
            for (let attempt = 0; attempt < 2; attempt++) {
                if (cancellation?.aborted) throw new DOMException('Aborted', 'AbortError');
                const attemptSignal = new AbortController();
                const onAbort = () => attemptSignal.abort();
                cancellation?.addEventListener('abort', onAbort, { once: true });
                const timeout = await SetTimeout(() => attemptSignal.abort(), IMAGE_FETCH_TIMEOUT_MS);
                try {
                    const response = await Fetch(new Request(page.Link, { signal: attemptSignal.signal, referrerPolicy: 'no-referrer' }));
                    if (!response.ok) {
                        // The host answered: it is alive, so no cooldown (the status error is likely
                        // systematic for this URL, a blind retry would only waste the time budget).
                        throw new Error(`Image request failed with HTTP ${response.status}: ${host}`);
                    }
                    return await response.blob();
                } catch (error) {
                    if (cancellation?.aborted) throw error;
                    if (attemptSignal.signal.aborted) {
                        imageHostCooldowns.set(host, Date.now() + IMAGE_HOST_COOLDOWN_MS);
                        throw new Error(`Image host did not answer within ${IMAGE_FETCH_TIMEOUT_MS}ms: ${host}`);
                    }
                    if (!(error instanceof TypeError)) throw error;
                    // Transient network error (reset, DNS hiccup): a single immediate retry,
                    // the second consecutive failure puts the host in cooldown below.
                    lastError = error;
                } finally {
                    ClearTimeout(timeout);
                    cancellation?.removeEventListener('abort', onAbort);
                }
                if (attempt < 1) await Delay(500);
            }
            imageHostCooldowns.set(host, Date.now() + IMAGE_HOST_COOLDOWN_MS);
            throw lastError instanceof Error ? lastError : new Error(String(lastError));
        }, priority, signal ?? undefined);
    }
}
