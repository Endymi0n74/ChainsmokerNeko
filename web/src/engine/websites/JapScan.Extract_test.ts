import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BuildReaderScript, FilterSiteChrome, OrderPageLinks, ProbeAdoption, ReadPageSelectorRange, ReadPageSelectorURLs, ReadTotalPageIndicator, TransformDRMPayload, type OrderedPageLink } from './JapScan.Extract';

describe('JapScan page extraction helpers', () => {
    it('Should order links by their DOM position instead of discovery order', () => {
        const pages: OrderedPageLink[] = [
            { link: 'https://c1.japscan.foo/page-2.jpg', order: 1, discovery: 0 },
            { link: 'https://c1.japscan.foo/page-1.jpg', order: 0, discovery: 1 },
            { link: 'https://c1.japscan.foo/page-3.jpg', order: Number.POSITIVE_INFINITY, discovery: 2 },
        ];

        expect(OrderPageLinks(pages)).toEqual([
            'https://c1.japscan.foo/page-1.jpg',
            'https://c1.japscan.foo/page-2.jpg',
            'https://c1.japscan.foo/page-3.jpg',
        ]);
    });

    it('Should not mutate the extracted page metadata', () => {
        const pages: OrderedPageLink[] = [
            { link: 'page-2', order: 1, discovery: 0 },
            { link: 'page-1', order: 0, discovery: 1 },
        ];

        OrderPageLinks(pages);

        expect(pages.map(page => page.link)).toEqual(['page-2', 'page-1']);
    });
});

describe('JapScan site chrome filter', () => {
    const documentHost = 'www.japscan.foo';

    it('Should drop the chrome the reader mounts on the site host', () => {
        // Exactly what the reader DOM delivered on a chapter where the probe
        // could not be adopted: 13 real pages + 4 site assets = 17 candidates.
        const links = [
            'https://www.japscan.foo/images/top-banner-728x90.png',
            'https://www.japscan.foo/images/donate.png',
            'https://www.japscan.foo/imgs/japys/image-1.jpg',
            'https://www.japscan.foo/imgs/japys/image-2.jpg',
            'https://c4.japscan.foo/abc123/def456/page.jpg?zw=7b88',
        ];

        expect(FilterSiteChrome(links, documentHost)).toEqual([
            'https://c4.japscan.foo/abc123/def456/page.jpg?zw=7b88',
        ]);
    });

    it('Should keep chapter images on a CDN subhost, whatever their path shape', () => {
        const links = [
            'https://c1.japscan.foo/manga/dreamland/volume-24/1.jpg',
            'https://c4.japscan.foo/abc123/def456/page.jpg?zw=7b88',
            'https://cdn.japscan.foo/manga/one-piece/1194/13.jpg',
        ];

        expect(FilterSiteChrome(links, documentHost)).toEqual(links);
    });

    it('Should keep a same-host page image inside the chapter tree', () => {
        // A reader served through a same-origin proxy builds its page URLs on the
        // document host; dropping those would empty the whole result.
        const links = [
            'https://www.japscan.foo/manga/one-piece/1194/1.jpg',
            'https://www.japscan.foo/images/top-banner-728x90.png',
        ];

        expect(FilterSiteChrome(links, documentHost)).toEqual([
            'https://www.japscan.foo/manga/one-piece/1194/1.jpg',
        ]);
    });

    it('Should drop static assets served from a CDN subhost', () => {
        const links = [
            'https://c1.japscan.foo/ad/_banner_/wide.jpg',
            'https://c1.japscan.foo/honeypot/e44j82.jpg',
            'https://c1.japscan.foo/images/logo.png',
            'https://c4.japscan.foo/promo/banner-728x90.jpg',
            'https://c4.japscan.foo/skins/donate.png',
            'https://c1.japscan.foo/manga/dreamland/volume-24/1.jpg',
        ];

        expect(FilterSiteChrome(links, documentHost)).toEqual([
            'https://c1.japscan.foo/manga/dreamland/volume-24/1.jpg',
        ]);
    });

    it('Should drop www aliases of the document host and malformed entries', () => {
        const links = [
            'https://www.japscan.foo/logo.png',
            'https://japscan.foo/favicon.png',
            'not a url at all',
            '',
            undefined as unknown as string,
            'https://c4.japscan.foo/abc123/page.jpg',
        ];

        expect(FilterSiteChrome(links, documentHost)).toEqual([
            'https://c4.japscan.foo/abc123/page.jpg',
        ]);
    });

    it('Should not mutate the input and should deduplicate', () => {
        const links = [
            'https://www.japscan.foo/images/donate.png',
            'https://c4.japscan.foo/abc123/page.jpg',
            'https://c4.japscan.foo/abc123/page.jpg',
        ];

        expect(FilterSiteChrome(links, documentHost)).toEqual(['https://c4.japscan.foo/abc123/page.jpg']);
        expect(links).toHaveLength(3);
    });
});

describe('JapScan DRM payload transform', () => {
    it('Should keep page URLs in order and append the DRM access token', () => {
        const payload = [
            'https://c1.japscan.foo/manga/dreamland/volume-24/1.jpg',
            'https://c1.japscan.foo/manga/dreamland/volume-24/2.jpg',
        ];

        expect(TransformDRMPayload(payload)).toEqual([
            'https://c1.japscan.foo/manga/dreamland/volume-24/1.jpg?xc=91f4',
            'https://c1.japscan.foo/manga/dreamland/volume-24/2.jpg?xc=91f4',
        ]);
    });

    it('Should drop banner and honeypot entries from the payload', () => {
        const payload = [
            'https://c1.japscan.foo/ad/_banner_/wide.jpg',
            'https://c1.japscan.foo/manga/dreamland/volume-24/1.jpg',
            'https://c1.japscan.foo/honeypot/e44j82.jpg',
        ];

        expect(TransformDRMPayload(payload)).toEqual([
            'https://c1.japscan.foo/manga/dreamland/volume-24/1.jpg?xc=91f4',
        ]);
    });

    it('Should tolerate non-array or malformed payloads', () => {
        expect(TransformDRMPayload(undefined)).toEqual([]);
        expect(TransformDRMPayload({ ax: [] })).toEqual([]);
        expect(TransformDRMPayload(['not a url', ''])).toEqual([]);
        expect(TransformDRMPayload([42])).toEqual([]);
    });
});

describe('JapScan total page indicator', () => {

    beforeEach(() => {
        vi.unstubAllGlobals();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    function StubDocument(body: Partial<Document>): void {
        vi.stubGlobal('document', body as unknown as Document);
    }

    it('Should tolerate a missing DOM (node test environment)', () => {
        expect(ReadTotalPageIndicator()).toBeUndefined();
    });

    it('Should read the dedicated #pages selector option count', () => {
        StubDocument({
            querySelector: (selector: string) => selector === 'select#pages'
                ? { options: { length: 214 }, getAttribute: () => null } as unknown as HTMLSelectElement
                : null,
            querySelectorAll: () => [] as unknown as ReturnType<typeof document.querySelectorAll>,
        });

        expect(ReadTotalPageIndicator()).toBe(214);
    });

    it('Should read a page-like selector by id when #pages is absent', () => {
        StubDocument({
            querySelector: () => null,
            querySelectorAll: (selector: string) => selector === 'select'
                ? [
                    {
                        id: 'pagebar', name: '', className: '',
                        options: Array.from({ length: 10 }, (_, index) => ({ value: String(index + 1) })),
                    },
                ] as unknown as ReturnType<typeof document.querySelectorAll>
                : [] as unknown as ReturnType<typeof document.querySelectorAll>,
        });

        expect(ReadTotalPageIndicator()).toBe(10);
    });

    it('Should fall back to a "Page X / N" text indicator', () => {
        StubDocument({
            querySelector: () => null,
            querySelectorAll: () => [] as unknown as ReturnType<typeof document.querySelectorAll>,
            body: { textContent: 'Chapitre 12 — Page 3 / 25 — Lecture en ligne' } as unknown as HTMLElement,
        });

        expect(ReadTotalPageIndicator()).toBe(25);
    });

    it('Should ignore implausible totals (0, 1, non-numeric)', () => {
        StubDocument({
            querySelector: () => ({ options: { length: 1 }, getAttribute: () => null }) as unknown as HTMLSelectElement,
            querySelectorAll: () => [] as unknown as ReturnType<typeof document.querySelectorAll>,
            body: { textContent: 'Page 1 / 1' } as unknown as HTMLElement,
        });

        expect(ReadTotalPageIndicator()).toBeUndefined();
    });
});

describe('JapScan page selector URLs', () => {

    interface FakeOption {
        value: string;
        textContent?: string;
        attributes?: Record<string, string>;
    }

    interface FakeSelect {
        id: string;
        name: string;
        className: string;
        options: FakeOption[];
        getAttribute?: (name: string) => string | null;
    }

    function StubReader(selects: FakeSelect[], pathname = '/manga/dreamland/volume-24/'): void {
        vi.stubGlobal('location', {
            href: `https://www.japscan.foo${pathname}`,
            hostname: 'www.japscan.foo',
            pathname,
            search: '',
        } as unknown as Location);
        vi.stubGlobal('document', {
            querySelector: () => null,
            querySelectorAll: (selector: string) => selector === 'select'
                ? selects.map(select => ({
                    id: select.id,
                    name: select.name,
                    className: select.className,
                    getAttribute: (name: string) => select.getAttribute ? select.getAttribute(name) : null,
                    options: select.options.map(option => ({
                        value: option.value,
                        textContent: option.textContent ?? '',
                        getAttribute: (name: string) => option.attributes?.[name] ?? null,
                    })),
                })) as unknown as ReturnType<typeof document.querySelectorAll>
                : [] as unknown as ReturnType<typeof document.querySelectorAll>,
        } as unknown as Document);
    }

    beforeEach(() => {
        vi.unstubAllGlobals();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('Should tolerate a missing DOM (node test environment)', () => {
        expect(ReadPageSelectorURLs()).toEqual([]);
    });

    it('Should read per-page URLs from the #pages selector in option order', () => {
        StubReader([{
            id: 'pages',
            name: '',
            className: '',
            options: [
                { value: '/manga/dreamland/volume-24/2/' },
                { value: '/manga/dreamland/volume-24/3/' },
                { value: '/manga/dreamland/volume-24/4/' },
            ],
        }]);

        expect(ReadPageSelectorURLs()).toEqual([
            'https://www.japscan.foo/manga/dreamland/volume-24/2/',
            'https://www.japscan.foo/manga/dreamland/volume-24/3/',
            'https://www.japscan.foo/manga/dreamland/volume-24/4/',
        ]);
    });

    it('Should honor data-url attributes when plain values are bare page numbers', () => {
        StubReader([{
            id: 'pages',
            name: '',
            className: '',
            options: [
                { value: '1', attributes: { 'data-url': '/manga/dreamland/volume-24/1/' } },
                { value: '2', attributes: { 'data-url': 'https://www.japscan.foo/manga/dreamland/volume-24/2/' } },
                { value: '3' },
            ],
        }]);

        expect(ReadPageSelectorURLs()).toEqual([
            'https://www.japscan.foo/manga/dreamland/volume-24/1/',
            'https://www.japscan.foo/manga/dreamland/volume-24/2/',
        ]);
    });

    it('Should drop numbers, the current page, foreign hosts and other chapters', () => {
        StubReader([{
            id: 'pages',
            name: '',
            className: '',
            options: [
                { value: '1' },
                { value: '#page-2' },
                { value: '/manga/dreamland/volume-24/' },
                { value: '/manga/dreamland/volume-24/2/' },
                { value: '/manga/dreamland/214/' },
                { value: 'https://cdn.japscan.foo/manga/dreamland/volume-24/3.jpg' },
                { value: 'https://other-site.example/manga/dreamland/volume-24/4/' },
            ],
        }]);

        expect(ReadPageSelectorURLs()).toEqual([
            'https://www.japscan.foo/manga/dreamland/volume-24/2/',
        ]);
    });

    it('Should deduplicate repeated page URLs', () => {
        StubReader([{
            id: 'pages',
            name: '',
            className: '',
            options: [
                { value: '/manga/dreamland/volume-24/2/', attributes: { 'data-href': '/manga/dreamland/volume-24/2/' } },
                { value: '/manga/dreamland/volume-24/2/' },
                { value: '/manga/dreamland/volume-24/3/' },
            ],
        }]);

        expect(ReadPageSelectorURLs()).toEqual([
            'https://www.japscan.foo/manga/dreamland/volume-24/2/',
            'https://www.japscan.foo/manga/dreamland/volume-24/3/',
        ]);
    });
});

describe('JapScan page selector numeric range', () => {

    interface FakeRangeOption {
        value: string;
        textContent?: string;
    }

    interface FakeRangeSelect {
        id: string;
        name: string;
        className: string;
        options: FakeRangeOption[];
    }

    function RangeStub(selects: FakeRangeSelect[]): void {
        vi.stubGlobal('location', {
            href: 'https://www.japscan.foo/manga/dreamland/volume-24/',
            hostname: 'www.japscan.foo',
            pathname: '/manga/dreamland/volume-24/',
            search: '',
        } as unknown as Location);
        vi.stubGlobal('document', {
            querySelector: () => null,
            querySelectorAll: (selector: string) => selector === 'select'
                ? selects.map(select => ({
                    id: select.id,
                    name: select.name,
                    className: select.className,
                    getAttribute: () => null,
                    options: select.options.map(option => ({
                        value: option.value,
                        textContent: option.textContent ?? '',
                        getAttribute: () => null,
                    })),
                })) as unknown as ReturnType<typeof document.querySelectorAll>
                : [] as unknown as ReturnType<typeof document.querySelectorAll>,
        } as unknown as Document);
    }

    it('Should return the min/max of bare-number options in #pages', () => {
        RangeStub([{
            id: 'pages',
            name: '',
            className: '',
            options: Array.from({ length: 204 }, (_, index) => ({ value: String(index + 1) })),
        }]);
        expect(ReadPageSelectorRange()).toEqual({ min: 1, max: 204 });
    });

    it('Should span non-contiguous numeric options', () => {
        RangeStub([{
            id: 'pages',
            name: '',
            className: '',
            options: [
                { value: '3' },
                { value: '7' },
                { value: '5' },
            ],
        }]);

        expect(ReadPageSelectorRange()).toEqual({ min: 3, max: 7 });
    });

    it('Should fall back to the option count for labelled options', () => {
        RangeStub([{
            id: 'pages',
            name: '',
            className: '',
            options: [
                { value: '', textContent: 'Page 1' },
                { value: '', textContent: 'Page 2' },
                { value: '', textContent: 'Page 3' },
            ],
        }]);

        expect(ReadPageSelectorRange()).toEqual({ min: 1, max: 3 });
    });

    it('Should return undefined when no page-like selector exists', () => {
        RangeStub([{
            id: 'volume',
            name: 'sort',
            className: '',
            options: [
                { value: 'asc' },
                { value: 'desc' },
            ],
        }]);

        expect(ReadPageSelectorRange()).toBeUndefined();
    });

    it('Should ignore URL-valued options (not a numeric range)', () => {
        RangeStub([{
            id: 'pages',
            name: '',
            className: '',
            options: [
                { value: '/manga/dreamland/volume-24/2/' },
                { value: '/manga/dreamland/volume-24/3/' },
            ],
        }]);

        // URL-valued selectors are handled by ReadPageSelectorURLs instead.
        expect(ReadPageSelectorRange()).toEqual({ min: 1, max: 2 });
    });
});

describe('JapScan reader injection script', () => {
    const render = () => BuildReaderScript('jknfixture');

    it('Should render a script that parses as JavaScript', () => {
        const rendered = render();
        expect(rendered).toContain('jknfixture');
        // The body is a template literal, which tsc does not type-check: one stray
        // backtick in a comment closes it early and the script only fails when the
        // reader window injects it — invisible to tsc and to every other test.
        // Parsing the rendered string here keeps that class of bug visible.
        expect(() => new Function(rendered)).not.toThrow();
    });

    it('Should stop the page hunt on the filtered count, never the raw one', () => {
        const rendered = render();
        // Site chrome (banner / donate / japys) lives in seen as well, so a stop test
        // written against seen.size stops N URLs early: finalize() strips that chrome
        // from the result, the host-side completeness check comes back N pages short
        // and forces a DRM fallback (and a retry) on every big 200+ page chapter.
        expect(rendered).not.toMatch(/seen\.size\s*>=\s*total/);
        expect(rendered).not.toMatch(/seen\.size\s*<\s*total/);
        expect(rendered).toMatch(/contentSize\(\)\s*>=\s*total/);
        expect(rendered).toMatch(/contentSize\(\)\s*<\s*total/);
    });

    it('Should wait on the site construction as well, not on the DOM alone', () => {
        const rendered = render();
        // The DOM plateaus around ~110 images on a volume while the reader is still
        // building the announced pages: a stall test written against the DOM only
        // stops the drain mid-construction and finalize() then falls back to the
        // much shorter DOM list (106 pages instead of 167 on a throttled run).
        expect(rendered).toMatch(/const grown = progressSize\(\)/);
        expect(rendered).toMatch(/const currentCount = progressSize\(\)/);
        // Once the probe covers the announced total it stops driving the wait, so
        // the normal path drains the DOM exactly as before.
        expect(rendered).toMatch(/probe < total/);
    });

    it('Should decide the probe adoption through the shared rule', () => {
        const rendered = render();
        // The acceptance rule is a real function (ProbeAdoption) so it is unit
        // tested below; this only guards against it being inlined back into the
        // script as an independent copy that drifts away from those tests.
        expect(rendered).toMatch(/ProbeAdoption\(/);
        expect(rendered).toMatch(/probeAdopt\(probePages\.length, domLinks\.length, total \|\| 0, probeAnchor, probeOverlap\)/);
        expect(rendered).toMatch(/adoption\.adopt/);
    });
});

describe('JapScan probe adoption rule', () => {
    // Real numbers from a 204-page volume: the DOM stops at ~106 filtered links
    // while the reader's own URL construction reached the announced total.
    const fullVolume = { probeLen: 204, domLen: 106, total: 204, anchor: 0, overlap: 0.991 };

    it('Should adopt a probe that covers the announced total', () => {
        const result = ProbeAdoption(fullVolume.probeLen, fullVolume.domLen, fullVolume.total, fullVolume.anchor, fullVolume.overlap);
        expect(result).toEqual({ adopt: true, dominates: true, coversTotal: true, partial: false });
    });

    it('Should adopt a partial probe that dominates the DOM and overlaps almost fully', () => {
        // The throttled run: the site built 167 of 204 URLs (its own fetches hit
        // 404s right after an interactive challenge) and finalize() landed while it
        // was still building. Rejecting the probe discarded 61 real pages and the
        // result fell back to the DOM list alone.
        const result = ProbeAdoption(167, 106, 204, 0, 0.991);
        expect(result.adopt).toBe(true);
        expect(result.partial).toBe(true);
        expect(result.coversTotal).toBe(false);
    });

    it('Should reject a short probe whose overlap with the DOM is weak', () => {
        // Same length, but most DOM links are absent from the probe: the extra URLs
        // are then not page content and would ship as stray thumbnails.
        expect(ProbeAdoption(167, 106, 204, 0, 0.4).adopt).toBe(false);
    });

    it('Should reject a partial probe that covers less than 70% of the total', () => {
        // 130/204 is barely longer than the DOM list; trusting it only widens the
        // error while still forcing the DRM fallback (the result stays short).
        expect(ProbeAdoption(130, 106, 204, 0, 0.991).adopt).toBe(false);
        expect(ProbeAdoption(143, 106, 204, 0, 0.991).adopt).toBe(true);
    });

    it('Should reject a probe the DOM does not anchor against', () => {
        // No DOM link found in the probe means the two lists cannot be ordered
        // against each other, whatever their sizes.
        expect(ProbeAdoption(204, 106, 204, -1, 0.991).adopt).toBe(false);
    });

    it('Should still reject a probe that neither extends the DOM nor covers it', () => {
        // Small chapter: 8 constructed URLs against 10 DOM links and a total of 12.
        expect(ProbeAdoption(8, 10, 12, 0, 1).adopt).toBe(false);
        // The stray-thumbnail case: exactly total URLs while the DOM reports total+1
        // is trusted (covers the announced total), the reverse never is.
        expect(ProbeAdoption(12, 13, 12, 0, 1).adopt).toBe(true);
        expect(ProbeAdoption(11, 13, 12, 0, 1).adopt).toBe(false);
    });

    it('Should not require a total when the reader announces none', () => {
        expect(ProbeAdoption(17, 10, 0, 0, 1).adopt).toBe(true);
        // Without a total there is no coverage to fall back on: the probe has to
        // genuinely extend the DOM.
        expect(ProbeAdoption(12, 10, 0, 0, 1).adopt).toBe(false);
    });

    it('Should keep the DOM fallback whenever the DRM payload decoded', () => {
        // drmComplete() gates the whole rule in finalize(); this documents that the
        // rule itself never returns a "force" flag a caller could act on alone.
        expect(ProbeAdoption(0, 0, 0, 0, 1).adopt).toBe(false);
    });
});
