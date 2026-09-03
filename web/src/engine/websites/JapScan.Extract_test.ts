import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderPageLinks, ReadPageSelectorURLs, ReadTotalPageIndicator, TransformDRMPayload, type OrderedPageLink } from './JapScan.Extract';

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
