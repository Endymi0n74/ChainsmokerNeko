import { Tags } from '../Tags';
import icon from './MangaDrama.webp';
import {
    FetchWindowScript
} from '../platform/FetchProvider';
import {
    CreateRemoteBrowserWindow
} from '../platform/RemoteBrowserWindow';
import {
    Delay
} from '../BackgroundTimers';
import {
    DecoratableMangaScraper,
    Manga,
    Chapter,
    Page,
    type MangaPlugin
} from '../providers/MangaPlugin';
import * as Common from './decorators/Common';

type MangaDramaEntry = {
    id: string;
    title: string;
};

type MangaDramaChapter = {
    id: string;
    title: string;
};

type MangaDramaPages = {
    locked: boolean;
    message: string;
    urls: string[];
};

@Common.ImageAjax()
export default class extends DecoratableMangaScraper {

    public constructor() {
        super(
            'mangadrama',
            'MangaDrama',
            'https://mangadrama.com',
            Tags.Language.English,
            Tags.Media.Manga,
            Tags.Media.Manhwa,
            Tags.Media.Manhua,
            Tags.Source.Aggregator
        );
    }

    public override get Icon() {
        return icon;
    }

    public override async Initialize(): Promise<void> {
        // MangaDrama serves purchased (coin-unlocked) chapters only to an
        // authenticated session. Detect login server-side via the REST API;
        // when not logged in, open the account page in a visible window so the
        // user can sign in. The session cookies land in the app's persistent
        // shared session, so locked chapters become readable (is_purchased /
        // InitMangaEncryptedChapter) on the next refresh.
        const loggedIn = await this.#IsLoggedIn();
        if(loggedIn) {
            return;
        }

        const win = CreateRemoteBrowserWindow();
        // Open directly visible so the user can sign in.
        await win.Open(new Request(new URL('/my-account/', this.URI)), true, '');

        // Poll the auth endpoint in the background; close the window as soon as
        // the session is authenticated. Gives up silently if the user closes
        // the window or after ~5 minutes.
        this.#WaitForLogin(win);
    }

    async #IsLoggedIn(): Promise<boolean> {
        try {
            return await FetchWindowScript<boolean>(
                new Request(
                    new URL('/wp-json/wp/v2/users/me', this.URI)
                ),
                `fetch('/wp-json/wp/v2/users/me', { headers: { Accept: 'application/json' } })
                    .then(response => response.ok)`
            );
        } catch {
            return false;
        }
    }

    async #WaitForLogin(win: ReturnType<typeof CreateRemoteBrowserWindow>): Promise<void> {
        try {
            for(let i = 0; i < 60; i++) { // ~5 minutes
                await Delay(5000);
                const loggedIn = await win.ExecuteScript<boolean>(
                    `fetch('/wp-json/wp/v2/users/me', { headers: { Accept: 'application/json' } })
                        .then(response => response.ok)`
                );
                if(loggedIn) {
                    await win.Close();
                    return;
                }
            }
        } catch {
            // Window was closed by the user — stop polling.
            return;
        }
        try {
            await win.Close();
        } catch {
            // Window already closed.
        }
    }

    public override ValidateMangaURL(url: string): boolean {
        try {
            const uri = new URL(url);

            return uri.origin === this.URI.origin
                && /^\/manga\/[^/]+\/?$/.test(uri.pathname);
        } catch {
            return false;
        }
    }

    public override async FetchMangas(
        provider: MangaPlugin
    ): Promise<Manga[]> {
        const entries = await FetchWindowScript<MangaDramaEntry[]>(
            new Request(
                new URL('/manga/', this.URI)
            ),
            `
            new Promise(resolve => {
                const normalize = value =>
                    String(value ?? '')
                        .replace(/\\s+/g, ' ')
                        .trim();

                const getSlug = href => {
                    try {
                        return new URL(
                            href,
                            location.origin
                        ).pathname
                            .match(/^\\/manga\\/([^/]+)\\/?$/)
                            ?.at(1);
                    } catch {
                        return undefined;
                    }
                };

                const collect = () => {
                    const result = [];
                    const seen = new Set();

                    for(const anchor of document.querySelectorAll(
                        'a[href*="/manga/"]'
                    )) {
                        const id = getSlug(anchor.href);

                        if(!id || seen.has(id)) {
                            continue;
                        }

                        const container = anchor.closest(
                            'article, li, .item-summary, '
                            + '.page-item-detail, .row, .c-tabs-item__content'
                        );

                        const raw = anchor.getAttribute('title')
                            || anchor.querySelector('img')?.getAttribute('alt')
                            || container?.querySelector(
                                'h1, h2, h3, h4, .post-title, .title'
                            )?.textContent
                            || anchor.textContent;

                        let title = normalize(raw);

                        if(title.toLowerCase().startsWith('cover image of ')) {
                            title = title.slice('cover image of '.length).trim();
                        }

                        if(
                            !title
                            || /^manga$/i.test(title)
                            || title.length < 2
                            || !/[a-z]/i.test(title)
                        ) {
                            continue;
                        }

                        seen.add(id);
                        result.push({
                            id,
                            title
                        });
                    }

                    return result;
                };

                const started = Date.now();

                const poll = () => {
                    const entries = collect();

                    if(
                        entries.length > 0
                        || Date.now() - started > 15000
                    ) {
                        resolve(entries);
                    } else {
                        setTimeout(poll, 250);
                    }
                };

                poll();
            })
            `,
            500,
            30_000
        );

        return entries.map(
            ({ id, title }) =>
                new Manga(
                    this,
                    provider,
                    id,
                    title
                )
        );
    }

    public override async FetchManga(
        provider: MangaPlugin,
        url: string
    ): Promise<Manga> {
        const uri = new URL(url);
        const identifier = uri.pathname
            .match(/^\/manga\/([^/]+)\/?$/)
            ?.at(1);

        if(!identifier) {
            throw new Error(
                `Invalid MangaDrama URL: ${url}`
            );
        }

        const title = await FetchWindowScript<string>(
            new Request(uri),
            `
            new Promise(resolve => {
                const normalize = value =>
                    String(value ?? '')
                        .replace(/\\s+/g, ' ')
                        .trim();

                const clean = value =>
                    normalize(value)
                        .replace(
                            /\\s*[-|]\\s*Manga\\s*Drama\\s*$/i,
                            ''
                        )
                        .trim();

                const findTitle = () => [
                    document.querySelector('h1')?.textContent,
                    document.querySelector(
                        '.post-title h1, .post-title, .manga-title'
                    )?.textContent,
                    document.querySelector(
                        'meta[property="og:title"]'
                    )?.content,
                    document.title
                ]
                    .map(clean)
                    .find(Boolean);

                const started = Date.now();

                const poll = () => {
                    const title = findTitle();

                    if(
                        title
                        || Date.now() - started > 15000
                    ) {
                        resolve(
                            title
                            || '${identifier}'
                                .replace(/[-_]+/g, ' ')
                        );
                    } else {
                        setTimeout(poll, 250);
                    }
                };

                poll();
            })
            `,
            500,
            30_000
        );

        return new Manga(
            this,
            provider,
            identifier,
            title
        );
    }

    public override async FetchChapters(
        manga: Manga
    ): Promise<Chapter[]> {
        const chapters = await FetchWindowScript<MangaDramaChapter[]>(
            new Request(
                new URL(
                    `/manga/${manga.Identifier}/`,
                    this.URI
                )
            ),
            `
            new Promise(resolve => {
                const chapterRoot =
                    '/manga/${manga.Identifier}/';

                const extractChapter = href => {
                    try {
                        const uri = new URL(
                            href,
                            location.origin
                        );

                        if(
                            uri.origin !== location.origin
                            || !uri.pathname.startsWith(chapterRoot)
                        ) {
                            return undefined;
                        }

                        const id = decodeURIComponent(
                            uri.pathname
                                .slice(chapterRoot.length)
                                .replace(/^\\/+|\\/+$/g, '')
                        );

                        if(
                            !id
                            || /^read$/i.test(id)
                            || id === '${manga.Identifier}'
                        ) {
                            return undefined;
                        }

                        return id;
                    } catch {
                        return undefined;
                    }
                };

                const getChapterNumber = value => {
                    const match = String(value ?? '').match(
                        /(?:chapter|ch\\.?|episode|ep\\.?)?[-_\\s]*([0-9]+(?:\\.[0-9]+)?)/i
                    );

                    return match
                        ? Number.parseFloat(match[1])
                        : Number.NEGATIVE_INFINITY;
                };

                const formatChapterTitle = id => {
                    const normalized = String(id)
                        .replace(/[-_]+/g, ' ')
                        .replace(/\\s+/g, ' ')
                        .trim();

                    const match = normalized.match(
                        /^(?:chapter|ch\\.?|episode|ep\\.?)\\s*([0-9]+(?:\\.[0-9]+)?)(?:\\s+(.*))?$/i
                    );

                    if(!match) {
                        const number = getChapterNumber(normalized);

                        return Number.isFinite(number)
                            ? 'Chapter ' + number
                            : normalized;
                    }

                    const number = match[1];
                    const subtitle = String(match[2] ?? '')
                        .replace(
                            /^\\d+\\s+(?:minute|minutes|hour|hours|day|days|week|weeks|month|months|year|years)\\b.*$/i,
                            ''
                        )
                        .trim();

                    return subtitle
                        ? 'Chapter ' + number + ' - ' + subtitle
                        : 'Chapter ' + number;
                };

                const markTitle = (title, locked) =>
                    locked ? '🔒 ' + title : title;

                const collectFromDOM = () => {
                    const result = [];
                    const seen = new Set();

                    const selectors = [
                        '.wp-manga-chapter a',
                        '.version-chap a',
                        '.chapter-link',
                        'a[href*="/chapter-"]',
                        'a[href*="/chapter/"]',
                        'a[href^="' + chapterRoot + '"]'
                    ].join(',');

                    for(const anchor of document.querySelectorAll(
                        selectors
                    )) {
                        const id = extractChapter(anchor.href);

                        if(!id || seen.has(id)) {
                            continue;
                        }

                        if(
                            !/(?:chapter|ch\\.?|episode|ep\\.?|\\d)/i
                                .test(id)
                        ) {
                            continue;
                        }

                        seen.add(id);

                        const item = anchor.closest('div');
                        const locked = !!(
                            item
                            && item.querySelector(
                                '[uk-icon*="lock"], [data-icon="lock"], .uk-icon-lock'
                            )
                        );

                        result.push({
                            id,
                            title: markTitle(formatChapterTitle(id), locked)
                        });
                    }

                    return result.sort(
                        (left, right) =>
                            getChapterNumber(right.id)
                            - getChapterNumber(left.id)
                    );
                };

                const mangaId = document.querySelector(
                    '[data-manga-id]'
                )?.getAttribute('data-manga-id')
                    || document.querySelector(
                        '#manga-title[data-id]'
                    )?.getAttribute('data-id');

                const fetchREST = async () => {
                    if(!mangaId) {
                        return null;
                    }

                    const collected = [];

                    for(let page = 1; page <= 30; page++) {
                        const response = await fetch(
                            location.origin
                            + '/wp-json/initmanga/v1/chapters'
                            + '?manga_id=' + encodeURIComponent(mangaId)
                            + '&paged=' + page
                            + '&per_page=50',
                            { headers: { Accept: 'application/json' } }
                        );

                        if(!response.ok) {
                            break;
                        }

                        const json = await response.json();
                        const items = Array.isArray(json?.items)
                            ? json.items
                            : [];

                        if(items.length === 0) {
                            break;
                        }

                        collected.push(...items);

                        if(items.length < 50) {
                            break;
                        }
                    }

                    if(collected.length === 0) {
                        return null;
                    }

                    return collected.map(item => {
                        const id = String(item.slug ?? '')
                            || 'chapter-' + item.number;
                        const number = item.number;
                        const raw = String(item.title ?? '')
                            .replace(/\\s+/g, ' ')
                            .trim();
                        const plain = !raw
                            || raw.toLowerCase()
                                === 'chapter ' + number;
                        const base = plain
                            ? 'Chapter ' + number
                            : 'Chapter ' + number + ' - ' + raw;
                        // Purchased chapters keep their lock_type in the API; the
                        // is_purchased flag reflects the logged-in user's ownership.
                        const locked = Boolean(
                            item.lock_type
                            && item.lock_type !== 'none'
                            && item.is_purchased !== true
                        );
                        // Coin-locked chapters are server-side paywalled; surface
                        // the price so the reader knows what a chapter costs.
                        const price = locked
                            && item.lock_type === 'coin'
                            && Number(item.lock_value) > 0
                            ? ' (' + item.lock_value + ' coin'
                                + (Number(item.lock_value) > 1 ? 's' : '') + ')'
                            : '';

                        return {
                            id,
                            base,
                            price,
                            locked
                        };
                    });
                };

                const pollDOM = () => new Promise(resolve => {
                    const started = Date.now();

                    const poll = () => {
                        const result = collectFromDOM();

                        if(
                            result.length > 0
                            || Date.now() - started > 20000
                        ) {
                            resolve(result);
                        } else {
                            setTimeout(poll, 300);
                        }
                    };

                    poll();
                });

                // The DOM overlay is best-effort: wait at most 5 s for the page
                // to render, otherwise fall back to the REST lock state (which
                // already respects is_purchased).
                const domGrace = new Promise(resolve =>
                    setTimeout(() => resolve(null), 5000)
                );

                Promise.all([fetchREST(), Promise.race([pollDOM(), domGrace])])
                    .then(([rest, dom]) => {
                        if(rest && rest.length > 0) {
                            // The rendered page reflects the logged-in user's real
                            // state (purchased chapters lose their lock icon) —
                            // overlay it on the REST list.
                            const domLocked = new Map(
                                (dom || []).map(item => [item.id, item.locked])
                            );

                            resolve(rest.map(item => {
                                const locked = domLocked.has(item.id)
                                    ? domLocked.get(item.id)
                                    : item.locked;

                                return {
                                    id: item.id,
                                    title: markTitle(
                                        item.base + (locked ? item.price : ''),
                                        locked
                                    )
                                };
                            }));
                            return;
                        }

                        resolve(dom || []);
                    });
            })
            `,
            750,
            60_000
        );

        return chapters.map(
            ({ id, title }) =>
                new Chapter(
                    this,
                    manga,
                    id,
                    title,
                    Tags.Language.English
                )
        );
    }

    public override async FetchPages(
        chapter: Chapter
    ): Promise<Page[]> {
        const result = await FetchWindowScript<MangaDramaPages>(
            new Request(
                new URL(
                    `/manga/${chapter.Parent.Identifier}/${chapter.Identifier}/`,
                    this.URI
                ),
                {
                    headers: {
                        Referer: this.URI.href
                    }
                }
            ),
            `
            new Promise(resolve => {
                const isImageURL = value => {
                    if(!value || typeof value !== 'string') return false;
                    if(value.startsWith('data:')) return false;
                    return /\\.(?:jpe?g|png|webp|gif|avif)(?:\\?|$)/i.test(value);
                };

                const getSrc = img => {
                    return img.getAttribute('data-original-src')
                        || img.getAttribute('data-src')
                        || img.getAttribute('data-lazy-src')
                        || img.getAttribute('data-original')
                        || img.getAttribute('src');
                };

                const extractImages = () => {
                    const result = [];
                    const seen = new Set();

                    const roots = [
                        document.querySelector('#chapter-content'),
                        document.querySelector('.reading-content'),
                        document.querySelector('.chapter-content'),
                        document.querySelector('.entry-content'),
                        document.querySelector('.wp-manga-chapter-img'),
                        document.querySelector('article'),
                        document.body
                    ].filter(Boolean);

                    for(const root of roots) {
                        for(const img of root.querySelectorAll('img')) {
                            const src = getSrc(img);
                            if(!src || !isImageURL(src)) continue;

                            try {
                                const url = new URL(src.trim().replaceAll('&amp;', '&'), location.href).href;
                                if(seen.has(url)) continue;

                                if(/(?:^|[\\/_.-])(logo|avatar|icon|banner|ads?|emoji|spinner|loading)(?:[\\/_.-]|$)/i.test(url)) {
                                    continue;
                                }

                                seen.add(url);
                                result.push(url);
                            } catch {
                                // ignore
                            }
                        }
                    }

                    return result;
                };

                const lockMessage = () => {
                    const card = document.querySelector('.lock-card');

                    if(!card) {
                        return undefined;
                    }

                    const detail = card.querySelector('.text-default, p');
                    const raw = detail
                        ? detail.textContent
                        : card.textContent;

                    return String(raw || '')
                        .replace(/\\s+/g, ' ')
                        .trim()
                        || 'This chapter is locked and requires coins to unlock.';
                };

                const started = Date.now();
                let lastCount = 0;
                let stableCount = 0;

                const poll = () => {
                    const message = lockMessage();

                    if(message) {
                        resolve({ locked: true, message, urls: [] });
                        return;
                    }

                    const images = extractImages();

                    if(images.length === lastCount) {
                        stableCount++;
                    } else {
                        stableCount = 0;
                        lastCount = images.length;
                    }

                    if((images.length > 0 && stableCount >= 2) || Date.now() - started > 20000) {
                        resolve({ locked: false, message: '', urls: images });
                    } else {
                        window.scrollTo(0, document.body.scrollHeight);
                        setTimeout(poll, 600);
                    }
                };

                poll();
            })
            `,
            1000,
            30_000
        );

        if(result.locked) {
            throw new Error(
                'This MangaDrama chapter is locked: ' + result.message
            );
        }

        const urls = result.urls;

        if(urls.length === 0) {
            throw new Error('No readable pages were found for this MangaDrama chapter.');
        }

        return urls.map(
            url =>
                new Page(
                    this,
                    chapter,
                    new URL(url),
                    {
                        Referer: this.URI.href
                    }
                )
        );
    }
}
