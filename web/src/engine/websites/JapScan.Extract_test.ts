import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderPageLinks, ReadTotalPageIndicator, type OrderedPageLink } from './JapScan.Extract';

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
