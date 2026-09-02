import { describe, expect, it } from 'vitest';
import { OrderPageLinks, type OrderedPageLink } from './JapScan.Extract';

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
