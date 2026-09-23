import { Tags } from '../Tags';
import icon from './ScanManga.webp';
import { DecoratableMangaScraper, type Manga, Chapter, Page } from '../providers/MangaPlugin';
import * as Common from './decorators/Common';
import type { Priority } from '../taskpool/DeferredTask';
import { Fetch, FetchCSS, FetchWindowScript } from '../platform/FetchProvider';

// Sentinel consumed by the Electron fetch provider (app/electron/src/ipc/FetchProvider.ts):
// when the `Cookie` header holds this exact value, the request is sent without any session
// cookies. ScanManga serves its chapter list and its reader page in a reduced form whenever
// its own `sessionT` cookie is present, so these requests must leave cookie-less.
const NoSessionCookiesSentinel = '__hkn_no_session_cookies__';

const pagescript = `
    new Promise( async (resolve, reject) => {
        try {
            // The reader globals (idc, sme, sml, pako) are injected asynchronously by the
            // site's own scripts; on a reduced page they never appear at all. Wait for them
            // instead of relying on the injection delay alone.
            const deadline = Date.now() + 20000;
            let ready = false;
            while (Date.now() < deadline) {
                try {
                    ready = typeof idc !== 'undefined'
                        && typeof sme !== 'undefined'
                        && typeof sml !== 'undefined'
                        && typeof pako !== 'undefined';
                } catch (error) {
                    ready = false;
                }
                if (ready) break;
                await new Promise(resolve => setTimeout(resolve, 250));
            }
            if (!ready) throw new Error('ScanManga reader did not initialize (reduced page or missing globals)');

            // Anti-bot fingerprint required by the current reader API (verified live):
            // a WebGL renderer string plus the effective connection type.
            const gpu = (() => {
                try {
                    const gl = document.createElement('canvas').getContext('webgl');
                    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
                    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
                } catch (error) {
                    return '';
                }
            })();
            const connection = navigator.connection && navigator.connection.effectiveType ? navigator.connection.effectiveType.toUpperCase() : 'IC';
            const response = await fetch('https://bqj.scan-manga.com/lel/' + idc + '.json', {
                method: 'POST',
                credentials: 'omit',
                headers: {
                    'Content-type': 'application/json; charset=UTF-8',
                    'source': window.location.href,
                    'Token': 'yf'
                },
                body: JSON.stringify({
                    a: sme,
                    b: sml,
                    c: btoa(JSON.stringify({ gpu, connection }))
                })
            });
            if (!response.ok) throw new Error('ScanManga reader API error: HTTP ' + response.status);

            const text = (await response.text()).trim();
            // Accept a JSON envelope ({e: ...}) as well as raw base64 payloads.
            const payload = text.startsWith('{') ? (JSON.parse(text).e ?? text) : text;
            // Decode chain (verified live): base64(gzip(reverse(base64(json)))), the
            // reversed payload starts with the reversed hex idc which must be stripped.
            const binary = atob(payload);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const inflated = pako.inflate(bytes, { to: 'string' });
            const reversed = inflated.split('').reverse().join('');
            const hex = idc.toString(16);
            const stripped = reversed.startsWith(hex.split('').reverse().join('')) ? reversed.slice(hex.length) : reversed;
            const _CHAPTERDATA = JSON.parse(atob(stripped));
            if (!_CHAPTERDATA || typeof _CHAPTERDATA.p !== 'object' || _CHAPTERDATA.p === null) {
                throw new Error('ScanManga reader API response is missing page data');
            }
            const _HOST = _CHAPTERDATA.dN;
            const _FOLDER = "/" + _CHAPTERDATA.s + '/' + _CHAPTERDATA.v + '/' + _CHAPTERDATA.c + '';
            const _BASEURL = "https://" + _HOST + '' + _FOLDER + '';
            const _IMGLIST = Object.keys(_CHAPTERDATA.p).map(_ITEM => {
                const _page = _CHAPTERDATA.p[_ITEM];
                let _path_ = _BASEURL;
                const _extension = _page.e;
                const finalpath = "/" + encodeURIComponent(_page.f) + '.' + _extension + '';
                _path_ += finalpath;
                return _path_;
            });
            resolve(_IMGLIST);
        } catch (error) {
            reject(error);
        }
    });
`;

@Common.MangaCSS(/^{origin}\/\d+\/[^.]+\.html$/, 'div.h2_titre h2')
@Common.MangasNotSupported()
export default class extends DecoratableMangaScraper {

    public constructor() {
        super('scanmanga', `ScanManga`, 'https://www.scan-manga.com', Tags.Media.Manga, Tags.Media.Manhwa, Tags.Media.Manhua, Tags.Language.French, Tags.Source.Aggregator);
    }

    public override get Icon() {
        return icon;
    }

    public override async FetchChapters(manga: Manga): Promise<Chapter[]> {
        const uri = new URL(manga.Identifier, this.URI);
        const request = new Request(uri, {
            headers: {
                Referer: this.URI.href,
                // ScanManga's server serves the chapter list only to cookie-less requests:
                // when its own `sessionT` cookie is present it returns a reduced page with
                // an empty chapter block. Ask the app's fetch provider to skip session-cookie
                // injection for this request (the sentinel is stripped before it leaves).
                'Cookie': '__hkn_no_session_cookies__'
            }
        });
        const data = await FetchCSS<HTMLAnchorElement>(request, 'div.contenu_volume_manga ul li.chapitre div.chapitre_nom a');
        return data.map(element => {
            const { id, title } = Common.DefaultElementInfoExtractor.call(this, element, uri);
            return new Chapter(this, manga, id, title.replace(manga.Title, '').trim() || manga.Title);
        });
    }

    public override async FetchPages(chapter: Chapter): Promise<Page[]> {
        const uri = new URL(chapter.Identifier, this.URI);
        const request = new Request(uri, {
            headers: {
                Referer: this.URI.href,
                // Same cookie-less requirement as FetchChapters: the reader page is served in
                // a reduced form (no reader globals) whenever the session carries `sessionT`.
                'Cookie': NoSessionCookiesSentinel
            }
        });
        const data = await FetchWindowScript<string[]>(request, pagescript, 500);
        return data.map(link => new Page(this, chapter, new URL(link, uri), { Referer: uri.href }));
    }

    public override async FetchImage(page: Page, priority: Priority, signal: AbortSignal): Promise<Blob> {
        return this.imageTaskPool.Add(async () => {
            const request = new Request(page.Link, {
                credentials: 'omit',
                signal: signal,
                referrerPolicy: 'unsafe-url',
                mode: 'cors',
                headers: {
                    Referer: new URL(page.Parent.Identifier, this.URI).href,
                    Origin: this.URI.origin,
                    Accept: '*/*',
                    'Sec-Fetch-Site': 'cross-site'
                }
            });
            const response = await Fetch(request);
            return await response.blob();
        }, priority, signal);
    }
}