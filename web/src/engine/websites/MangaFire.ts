import { Tags } from '../Tags';
import icon from './MangaFire.webp';
import {
    FetchWindowScript
} from '../platform/FetchProvider';
import {
    AddAntiScrapingDetection,
    FetchRedirection
} from '../platform/AntiScrapingDetection';
import {
    DecoratableMangaScraper,
    Manga,
    Chapter,
    Page,
    type MangaPlugin
} from '../providers/MangaPlugin';
import * as Common from './decorators/Common';

// Affiche la fenêtre navigateur quand le WAF présente son challenge custom
// (titre "Security check", bouton "Verify you're human").
// NOTE: MangaFire n'opte PAS pour le reload automatique des challenges (voir
// ChallengeReload.ts) : son challenge est résolu manuellement par l'utilisateur.
// Le recharger en boucle (comme pour CrunchyScan) bouclait sans fin.
AddAntiScrapingDetection(async (invoke) => {
    const challenged = await invoke<boolean>(`
        (() => {
            try {
                const title = (document.title || '').trim().toLowerCase();
                const heading = (document.querySelector('h1')?.textContent || '').toLowerCase();
                return title === 'security check'
                    || /verify you(?:'re| are)? human/i.test(heading);
            } catch {
                return false;
            }
        })()
    `);
    return challenged ? FetchRedirection.Interactive : undefined;
}, /https:\/\/(?:www\.)?mangafire\.to/);

const chapterLanguageMap = new Map([
    ['en', Tags.Language.English],
    ['es', Tags.Language.Spanish],
    ['es-la', Tags.Language.Spanish],
    ['fr', Tags.Language.French],
    ['ja', Tags.Language.Japanese],
    ['pt', Tags.Language.Portuguese],
    ['pt-br', Tags.Language.Portuguese]
]);

/**
 * L'identifiant API (hid) est le préfixe avant le premier tiret du slug de titre,
 * ex : `/title/pvzy-vagabondd` → hid `pvzy`.
 */
function GetHID(identifier: string): string {
    return identifier.split('-', 2)[0];
}

// Stages de chiffrement utilisés pour signer les requêtes API (paramètre `vrf`).
const STAGE_DATA: { tableB64: string; keyB64: string; iv: number }[] = [
    {
        tableB64:
            'yINlmUNho8VYJT+ibTIP+9ESiULpVEtMOoD6U6lRE0R/xwXo/Xp9NrUgC4cw/' +
            'Lmo33vUyjUE40kUoEWIr/fxfNNcq2s79ShQ5NhNrFnJ4hXPwOu/SuXzIbuTQKG' +
            'Fvfm08E9jvCfqAtoDqvQq3dVWPQFmJjgvkISBeXY3BgANR+yVnjGbcxZ47d6k' +
            'LNfZPIayTq3/YGySb1KuVZodWp/WGNAO5pfMcpaK53Hhs0allBszaMaxuouOwd' +
            'xbwgxIw6YunSsXjI05Yi0j9j4eHKfSXR8Ifo/Od+8iamRfCXTyvm7NGRGYdcQ' +
            '0ywcK/u6RXhrbcCm4t2eCtrDgQVecJGkQ+A==',
        keyB64: '0Ec58JOY3uBzJK9m3zqIOpdlF7UFiax9DmA=',
        iv: 0x5a,
    },
    {
        tableB64:
            'IUFltCxD3Oc2cwCgkJffthaOg9cgPUb0LgW6H/VtfcF0kc5F25t+aWj6JH9V' +
            'OhOaY0rAFdUxlDnl5BLNvwEJvQtP5qcw7vdb/K+chnbwnspSHT8mz5lqwz41T' +
            'ezG0hkO06FTjJZhsyNuFLDpD2ZZxQj/QIRcF90zpmQ7Byu483WsQqUE0C342H' +
            'L+JXngRB6fRzxRyVTaKu83h7UYTJ0QMt6ixFh6S3F8gqkKwrGTL3jHNBsD45U' +
            'nifK8+RGtishQV2K3rujLKEkiZxpr2dYcudFW4oFsDKhad3CLBvuyTqsCo4B7m' +
            'L5IKQ1vXo/MOOvq1I1d8ar9X6Ttu5KF4fZgiA==',
        keyB64: 'AAdjb1iPY8CiDmq9H34tKTBF8a3oDQ==',
        iv: 0x35,
    },
    {
        tableB64:
            'NQHlu1/wVO5EmkwQymF810qqY2xG1k2obcas4Z9mCsPEIFl9pRIjFxbJ7ybM' +
            'HbBckT5Ton85E0FOeHezbh/mjlEYpmpnlXOS8dgrqeq2KfxImTh1YK9y0PeMN' +
            'hzA1OQzSY9brYOJq/l2QnE/hwOeZIhPixVSKIUlDb5vLcH6RWKxkIEMuP0bDw' +
            'IqQ71AJJaEaMJL7A6YtyIwoRT+L5v4aZzodN/0+3nOGsfblFjgxSfPzVDjNFe' +
            'Nl5P26+kEC/8AHgdrpAbt3hHz3HrRN1Y6e+JHgF7ncFWnoF0y3THL1S71WgWG' +
            'Ca6KtSzTCCG58n68nTyj2T3Sshk7utqCtMi/ZQ==',
        keyB64: 'DELOJgPsVaCcblDtTGMdHzM=',
        iv: 0xba,
    },
];

// Code injecté dans chaque page pour signer les URLs API avec le token `vrf`.
const APIHelperScript = `
    const __stages = ${JSON.stringify(STAGE_DATA)}.map(({ tableB64, keyB64, iv }) => ({
        table: Uint8Array.from(atob(tableB64), c => c.charCodeAt(0)),
        key: Uint8Array.from(atob(keyB64), c => c.charCodeAt(0)),
        iv: iv
    }));
    const __sign = endpoint => {
        const url = new URL(endpoint, location.origin);
        url.searchParams.sort();
        const path = url.pathname.startsWith('/api/') ? '/' + url.pathname.slice('/api/'.length) : url.pathname;
        let data = new TextEncoder().encode(path + url.search);
        for (const stage of __stages) {
            const output = new Uint8Array(data.length);
            let previous = stage.iv;
            for (let i = 0; i < data.length; i++) {
                previous = stage.table[data[i] ^ stage.key[i % stage.key.length] ^ previous];
                output[i] = previous;
            }
            data = output;
        }
        const binary = String.fromCharCode(...data);
        return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
    };
    const __fetch = (path, params) => {
        const url = new URL(path, location.origin);
        for (const [key, value] of Object.entries(params ?? {})) {
            url.searchParams.set(key, String(value));
        }
        url.searchParams.sort();
        const vrf = __sign(url);
        url.searchParams.set('vrf', vrf);
        return fetch(url);
    };
`;

@Common.ImageAjax()
export default class extends DecoratableMangaScraper {

    public constructor() {
        super(
            'mangafire',
            'MangaFire',
            'https://mangafire.to',
            Tags.Language.English,
            Tags.Language.French,
            Tags.Language.Japanese,
            Tags.Language.Portuguese,
            Tags.Language.Spanish,
            Tags.Media.Manga,
            Tags.Media.Manhwa,
            Tags.Media.Manhua,
            Tags.Source.Aggregator
        );
    }

    public override get Icon() {
        return icon;
    }

    public override ValidateMangaURL(url: string): boolean {
        return new RegExpSafe(
            `^${this.URI.origin}/title/[^/]+$`
        ).test(url);
    }

    public override async FetchMangas(
        provider: MangaPlugin
    ): Promise<Manga[]> {
        const entries = await FetchWindowScript<
            { id: string; title: string }[]
        >(
            new Request(new URL('/titles', this.URI)),
            APIHelperScript + `
            new Promise(async resolve => {
                const result = [];
                const seen = new Set();

                const collect = async () => {
                    const fetchPage = async p => {
                        for (let attempt = 0; attempt < 3; attempt++) {
                            if (attempt > 0) {
                                await new Promise(done => setTimeout(done, 1000 * attempt));
                            }
                            const response = await __fetch('/api/titles', { page: p, limit: 100 });
                            if (response.ok) return response;
                        }
                        return null;
                    };

                    let page = 1;
                    let hasNext = true;
                    while (hasNext && page <= 2000) {
                        const pages = [];
                        for (let i = 0; i < 4 && page + i <= 2000; i++) {
                            pages.push(page + i);
                        }
                        const responses = await Promise.all(pages.map(fetchPage));
                        let progressed = false;
                        for (const response of responses) {
                            if (!response) {
                                hasNext = false;
                                break;
                            }
                            const { items, meta } = await response.json();
                            for (const item of items ?? []) {
                                const href = item.url ?? (item.hid ? '/title/' + item.hid : '');
                                const id = String(href ?? '').split('/title/').pop().split(/[?#]/)[0].trim();
                                const title = String(item.title ?? '').replace(/\\s+/g, ' ').trim();
                                if (!id || !title || seen.has(id)) continue;
                                seen.add(id);
                                result.push({ id, title });
                            }
                            if ((items ?? []).length > 0) progressed = true;
                            if ((items ?? []).length === 0 || meta?.hasNext === false) hasNext = false;
                        }
                        page += 4;
                        if (!progressed) break;
                    }
                };

                for (let attempt = 0; attempt < 3 && result.length === 0; attempt++) {
                    try { await collect(); } catch {}
                    if (result.length === 0) await new Promise(done => setTimeout(done, 750));
                }

                if (result.length === 0) {
                    for (const anchor of document.querySelectorAll('a[href^="/title/"]')) {
                        const id = (anchor.getAttribute('href') ?? '').split('/title/').pop().split(/[?#]/)[0].trim();
                        if (!id || seen.has(id)) continue;
                        const title = String(anchor.getAttribute('title') || anchor.querySelector('img')?.getAttribute('alt') || '').replace(/\\s+/g, ' ').trim();
                        if (!title) continue;
                        seen.add(id);
                        result.push({ id, title });
                    }
                }

                resolve(result);
            })
            `,
            750,
            130_000
        );

        return entries.map(
            ({ id, title }) => new Manga(this, provider, id, title)
        );
    }

    public override async FetchManga(
        provider: MangaPlugin,
        url: string
    ): Promise<Manga> {
        const match = url.match(/\/title\/([^/?#]+)/);
        const identifier = match?.at(1) ?? '';
        if (!identifier) {
            throw new Error(`Invalid MangaFire title URL: ${url}`);
        }
        const hid = GetHID(identifier);

        const title = await FetchWindowScript<string>(
            new Request(new URL(url)),
            APIHelperScript + `
            new Promise(async resolve => {
                const hid = '${hid}';
                let title = '';

                for (let attempt = 0; attempt < 3 && !title; attempt++) {
                    try {
                        const response = await __fetch('/api/titles/' + hid);
                        if (response.ok) {
                            const { data } = await response.json();
                            title = String(data?.title ?? '').replace(/\\s+/g, ' ').trim();
                        }
                    } catch {}
                    if (!title) await new Promise(done => setTimeout(done, 500));
                }

                if (!title) {
                    title = String(
                        document.querySelector('h1')?.textContent
                        || document.querySelector('meta[property="og:title"]')?.content
                        || document.title
                    ).replace(/\\s+/g, ' ').replace(/\\s*[-|]\\s*MangaFire\\s*$/i, '').trim();
                }

                resolve(title || '${identifier}'.replace(/[-_]+/g, ' '));
            })
            `,
            500,
            60_000
        );

        return new Manga(this, provider, identifier, title);
    }

    public override async FetchChapters(
        manga: Manga
    ): Promise<Chapter[]> {
        const hid = GetHID(manga.Identifier);

        const rows = await FetchWindowScript<
            { id: string; number: number; name: string; language: string; type: string; createdAt: number | null }[]
        >(
            new Request(
                new URL(`./title/${manga.Identifier}`, this.URI)
            ),
            APIHelperScript + `
            new Promise(async resolve => {
                const hid = '${hid}';
                const result = [];
                const seen = new Set();

                const collect = async () => {
                    let page = 1;
                    let hasNext = true;
                    while (hasNext && page <= 50) {
                        const response = await __fetch('/api/titles/' + hid + '/chapters', { sort: 'number', order: 'desc', limit: 200, page: page });
                        if (!response.ok) break;
                        const { items, meta } = await response.json();
                        for (const item of items ?? []) {
                            const id = String(item.id ?? '');
                            if (!id || seen.has(id)) continue;
                            seen.add(id);
                            result.push({
                                id,
                                number: item.number ?? 0,
                                name: String(item.name ?? '').replace(/\\s+/g, ' ').trim(),
                                language: String(item.language ?? 'en'),
                                type: String(item.type ?? ''),
                                createdAt: typeof item.createdAt === 'number' ? item.createdAt : null
                            });
                        }
                        hasNext = (items ?? []).length > 0 && meta?.hasNext !== false;
                        page++;
                    }
                };

                for (let attempt = 0; attempt < 3 && result.length === 0; attempt++) {
                    try { await collect(); } catch {}
                    if (result.length === 0) await new Promise(done => setTimeout(done, 750));
                }

                if (result.length === 0) {
                    for (const anchor of document.querySelectorAll('a[href*="/chapter/"]')) {
                        const href = anchor.getAttribute('href') ?? '';
                        const id = href.split('/chapter/').pop().split(/[?#]/)[0].trim();
                        if (!id || seen.has(id)) continue;
                        seen.add(id);
                        const raw = String(anchor.textContent || id).replace(/\\s+/g, ' ').trim();
                        const number = parseFloat((raw.match(/[0-9]+(?:[.][0-9]+)?/) ?? [])[0] ?? '0') || 0;
                        result.push({ id, number, name: raw, language: 'en', type: '' });
                    }
                }

                resolve(result);
            })
            `,
            750,
            120_000
        );

        return rows.map(({ id, number, name, language, type, createdAt }) => {
            const tag = chapterLanguageMap.get(language);
            return new Chapter(
                this,
                manga,
                id,
                [
                    `Ch. ${number}`,
                    name,
                    type && `(${type})`,
                    `(${language})`
                ].joinTitleSegments(),
                ...tag ? [ tag ] : [],
                createdAt ? new Date(createdAt * 1000) : undefined
            );
        });
    }

    public override async FetchPages(
        chapter: Chapter
    ): Promise<Page[]> {
        const urls = await FetchWindowScript<string[]>(
            new Request(
                new URL(
                    `./title/${chapter.Parent.Identifier}/chapter/${chapter.Identifier}`,
                    this.URI
                )
            ),
            APIHelperScript + `
            new Promise(async resolve => {
                const chapterId = '${chapter.Identifier}';
                let pages = [];

                for (let attempt = 0; attempt < 3 && pages.length === 0; attempt++) {
                    try {
                        const response = await __fetch('/api/chapters/' + chapterId);
                        if (response.ok) {
                            const { data } = await response.json();
                            pages = (data?.pages ?? []).map(page => page.url).filter(url => typeof url === 'string' && url);
                        }
                    } catch {}
                    if (pages.length === 0) await new Promise(done => setTimeout(done, 750));
                }

                // Fallback : le reader a déjà chargé les images, on les lit dans le DOM
                if (pages.length === 0) {
                    const extract = () => [...new Set(
                        [...document.querySelectorAll(
                            'img[src*="/manga/"], img[src*="mangafire"], .reader img, [class*="reader"] img, [class*="page"] img, [class*="viewer"] img'
                        )].map(img => img.currentSrc || img.src || img.dataset.src || '').filter(src => src && !src.startsWith('data:'))
                    )];
                    const start = Date.now();
                    let stable = 0;
                    let last = 0;
                    while (Date.now() - start < 20000) {
                        window.scrollTo(0, document.body.scrollHeight);
                        const found = extract();
                        if (found.length > 0 && found.length === last) {
                            stable++;
                            if (stable >= 4) { pages = found; break; }
                        } else {
                            stable = 0;
                            last = found.length;
                        }
                        await new Promise(done => setTimeout(done, 500));
                    }
                    if (pages.length === 0) pages = extract();
                }

                resolve(pages);
            })
            `,
            500,
            60_000
        );

        return urls.map(
            url =>
                new Page(
                    this,
                    chapter,
                    new URL(url),
                    { Referer: this.URI.href }
                )
        );
    }
}
