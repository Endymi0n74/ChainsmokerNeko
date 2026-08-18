import { describe, it, expect } from 'vitest';
import { MapMangaDramaChapter, type MangaDramaChapterItem } from './MangaDramaChapter';

describe('MapMangaDramaChapter', () => {

    describe('Lock state (cadenas)', () => {

        it('Should unlock a purchased coin-locked chapter', () => {
            const view = MapMangaDramaChapter({ slug: 'chapter-9', number: 9, title: '', lock_type: 'coin', lock_value: 4, is_purchased: true });
            expect(view.locked).toBe(false);
            expect(view.price).toBe('');
        });

        it('Should lock a coin-locked chapter that was not purchased', () => {
            const view = MapMangaDramaChapter({ slug: 'chapter-9', number: 9, title: '', lock_type: 'coin', lock_value: 4, is_purchased: false });
            expect(view.locked).toBe(true);
            expect(view.price).toBe(' (4 coins)');
        });

        it('Should lock a coin-locked chapter with no is_purchased flag', () => {
            const view = MapMangaDramaChapter({ slug: 'chapter-9', number: 9, title: '', lock_type: 'coin', lock_value: 4 });
            expect(view.locked).toBe(true);
            expect(view.price).toBe(' (4 coins)');
        });

        it('Should only treat exactly true as purchased', () => {
            const view = MapMangaDramaChapter({ slug: 'chapter-9', number: 9, title: '', lock_type: 'coin', lock_value: 4, is_purchased: 1 });
            expect(view.locked).toBe(true);
        });

        it('Should unlock chapters without a lock type', () => {
            expect(MapMangaDramaChapter({ slug: 'chapter-9', number: 9, title: '' }).locked).toBe(false);
            expect(MapMangaDramaChapter({ slug: 'chapter-9', number: 9, title: '', lock_type: 'none', is_purchased: false }).locked).toBe(false);
        });

        it('Should unlock a purchased chapter regardless of its lock type', () => {
            expect(MapMangaDramaChapter({ slug: 'chapter-9', number: 9, title: '', lock_type: 'credit', lock_value: 5, is_purchased: true }).locked).toBe(false);
        });
    });

    describe('Price formatting', () => {

        it('Should use the singular for a single coin', () => {
            const view = MapMangaDramaChapter({ slug: 'chapter-9', number: 9, title: '', lock_type: 'coin', lock_value: 1, is_purchased: false });
            expect(view.price).toBe(' (1 coin)');
        });

        it('Should not show a price for a non-coin lock type', () => {
            const view = MapMangaDramaChapter({ slug: 'chapter-9', number: 9, title: '', lock_type: 'credit', lock_value: 5, is_purchased: false });
            expect(view.locked).toBe(true);
            expect(view.price).toBe('');
        });
    });

    describe('Title and identifier', () => {

        it('Should build the base title from the number', () => {
            expect(MapMangaDramaChapter({ slug: 'chapter-273', number: 273, title: '' }).base).toBe('Chapter 273');
            expect(MapMangaDramaChapter({ slug: 'chapter-273', number: 273, title: 'chapter 273' }).base).toBe('Chapter 273');
        });

        it('Should append a custom subtitle', () => {
            expect(MapMangaDramaChapter({ slug: 'chapter-273', number: 273, title: 'Extra' }).base).toBe('Chapter 273 - Extra');
        });

        it('Should fall back to chapter-<number> when the slug is missing', () => {
            expect(MapMangaDramaChapter({ number: 7, title: '' }).id).toBe('chapter-7');
        });
    });

    describe('FetchWindowScript inlining', () => {

        it('Should remain self-contained via toString()', () => {
            const inlined = new Function('return (' + MapMangaDramaChapter.toString() + ')')() as typeof MapMangaDramaChapter;
            const input: MangaDramaChapterItem = { slug: 'chapter-9', number: 9, title: 'Test', lock_type: 'coin', lock_value: 2, is_purchased: false };
            expect(inlined(input)).toEqual(MapMangaDramaChapter(input));
        });
    });
});
