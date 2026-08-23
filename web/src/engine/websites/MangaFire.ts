import { Tags } from '../Tags';
import icon from './MangaFire.webp';
import { FetchJSON } from '../platform/FetchProvider';
import { GetBytesFromBase64, GetBytesFromUTF8, GetURLBase64FromBytes } from '../BufferEncoder';
import {
    DecoratableMangaScraper,
    Manga,
    Chapter,
    Page,
    type MangaPlugin
} from '../providers/MangaPlugin';
import * as Common from './decorators/Common';

const chapterLanguageMap = new Map([
    ['en', Tags.Language.English],
    ['es', Tags.Language.Spanish],
    ['es-la', Tags.Language.Spanish],
    ['fr', Tags.Language.French],
    ['ja', Tags.Language.Japanese],
    ['pt', Tags.Language.Portuguese],
    ['pt-br', Tags.Language.Portuguese]
]);

function GetHID(identifier: string): string {
    return identifier.split('-', 2)[0];
}

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

const STAGES = STAGE_DATA.map(({ tableB64, keyB64, iv }) => ({
    table: GetBytesFromBase64(tableB64),
    key: GetBytesFromBase64(keyB64),
    iv: iv,
}));

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

    public override async FetchMangas(provider: MangaPlugin): Promise<Manga[]> {
        const mangas: Manga[] = [];
        for (let page = 1; ; page++) {
            const { items } = await this.FetchAPI<{ items: { hid: string; title: string }[] }>(`./titles?page=${page}&limit=100`);
            for (const { hid, title } of items ?? []) {
                if (!hid || !title) continue;
                mangas.push(new Manga(this, provider, hid, title));
            }
            if ((items ?? []).length === 0) break;
        }
        return mangas;
    }

    public override async FetchManga(provider: MangaPlugin, url: string): Promise<Manga> {
        const match = url.match(/\/title\/([^/?#]+)/);
        const identifier = match?.at(1) ?? '';
        if (!identifier) throw new Error(`Invalid MangaFire title URL: ${url}`);
        const hid = GetHID(identifier);
        const { data: { title } } = await this.FetchAPI<{ data: { hid: string; title: string } }>(`./titles/${hid}`);
        return new Manga(this, provider, identifier, title);
    }

    public override async FetchChapters(manga: Manga): Promise<Chapter[]> {
        const hid = GetHID(manga.Identifier);
        const { items } = await this.FetchAPI<{ items: { id: string; number: number; name: string; language: string; type: string; createdAt: number | null }[] }>(`./titles/${hid}/chapters?sort=number&order=desc&limit=200`);
        return (items ?? []).map(({ id, number, name, language, type, createdAt }) => {
            const tag = chapterLanguageMap.get(language);
            return new Chapter(
                this, manga, id,
                [`Ch. ${number}`, name, type && `(${type})`, `(${language})`].joinTitleSegments(),
                ...tag ? [tag] : [],
                createdAt ? new Date(createdAt * 1000) : undefined
            );
        });
    }

    public override async FetchPages(chapter: Chapter): Promise<Page[]> {
        const { data: { pages } } = await this.FetchAPI<{ data: { pages: { url: string }[] } }>(`./${chapter.Identifier}`);
        return pages.map(({ url }) => new Page(this, chapter, new URL(url), { Referer: this.URI.href }));
    }

    private readonly apiURL = `${this.URI.origin}/api/`;

    private EncryptStage(data: Uint8Array, table: Uint8Array, key: Uint8Array, iv: number): Uint8Array {
        const output = new Uint8Array(data.length);
        let previous = iv;
        for (let i = 0; i < data.length; i++) {
            previous = table[data[i] ^ key[i % key.length] ^ previous];
            output[i] = previous;
        }
        return output;
    }

    private ComputeVrf(baseURL: URL): string {
        const url = new URL(baseURL);
        url.searchParams.sort();
        let data: Uint8Array = GetBytesFromUTF8(`${baseURL.pathname.replace(/^\/api\//, '/')}${url.search}`);
        for (const stage of STAGES) {
            data = this.EncryptStage(data, stage.table, stage.key, stage.iv);
        }
        return GetURLBase64FromBytes(data);
    }

    private async FetchAPI<T extends JSONElement>(endpoint: string): Promise<T> {
        const baseURL = new URL(endpoint, this.apiURL);
        baseURL.searchParams.set('vrf', this.ComputeVrf(baseURL));
        return FetchJSON<T>(new Request(baseURL));
    }
}
