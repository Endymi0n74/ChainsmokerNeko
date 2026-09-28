import { describe, it, expect } from 'vitest';
import '../RegExpSafe';
import KomaScans, { ResolveSeriesIdentifier, SeriesTitleFromSlug, ChapterTitleFromSlug, MapChapterNumber, MapChapterTitle, LocalizeChapterWord, type HydratedChapter } from './KomaScans';

function CreateChapter(values: Partial<HydratedChapter> = {}): HydratedChapter {
    return {
        id: 'cmrm6mv3x0l8f07tpqqk9hzfx',
        language: 'en',
        slug: 'chapter-1',
        number: 1,
        title: '',
        publishedAt: '2023-12-25T10:11:49.000Z',
        ...values,
    };
}

describe('ResolveSeriesIdentifier', () => {

    it('Should keep the identifier of a series URL', () => {
        expect(ResolveSeriesIdentifier('https://komascans.com/en/series/nano-machine')).toBe('/en/series/nano-machine');
    });

    it('Should resolve a chapter URL to its series counterpart', () => {
        expect(ResolveSeriesIdentifier('https://komascans.com/en/read/nano-machine/chapter-113-5')).toBe('/en/series/nano-machine');
    });

    it('Should support relative URLs', () => {
        expect(ResolveSeriesIdentifier('/fr/series/the-greatest-estate-developer')).toBe('/fr/series/the-greatest-estate-developer');
    });

    it('Should normalize the case of the locale and the slug', () => {
        expect(ResolveSeriesIdentifier('https://komascans.com/EN/series/Nano-Machine')).toBe('/en/series/nano-machine');
    });

    it('Should ignore a trailing query or hash', () => {
        expect(ResolveSeriesIdentifier('https://komascans.com/en/series/nano-machine?page=2')).toBe('/en/series/nano-machine');
        expect(ResolveSeriesIdentifier('https://komascans.com/en/read/nano-machine/chapter-1#chapters')).toBe('/en/series/nano-machine');
    });

    it('Should reject URLs which do not point to a series or a chapter', () => {
        expect(ResolveSeriesIdentifier('https://komascans.com/en/browse?page=2')).toBeNull();
        expect(ResolveSeriesIdentifier('https://komascans.com/en/series')).toBeNull();
        expect(ResolveSeriesIdentifier('https://komascans.com/')).toBeNull();
    });
});

describe('SeriesTitleFromSlug', () => {

    it('Should capitalize each segment of the slug', () => {
        expect(SeriesTitleFromSlug('nano-machine')).toBe('Nano Machine');
        expect(SeriesTitleFromSlug('overgeared')).toBe('Overgeared');
        expect(SeriesTitleFromSlug('zom-100-bucket-list-of-the-dead')).toBe('Zom 100 Bucket List of the Dead');
    });

    it('Should keep short words in lower case', () => {
        expect(SeriesTitleFromSlug('return-of-the-first-patriarch')).toBe('Return of the First Patriarch');
        expect(SeriesTitleFromSlug('my-exclusive-tower-guide')).toBe('My Exclusive Tower Guide');
    });

    it('Should reconstruct possessives and contractions', () => {
        expect(SeriesTitleFromSlug('the-pirate-s-slave-bride')).toBe("The Pirate's Slave Bride");
        expect(SeriesTitleFromSlug('omniscient-reader-s-viewpoint')).toBe("Omniscient Reader's Viewpoint");
        expect(SeriesTitleFromSlug('i-m-gonna-annihilate-this-land')).toBe("I'm Gonna Annihilate This Land");
        expect(SeriesTitleFromSlug('the-heavenly-demon-can-t-live-a-normal-life')).toBe("The Heavenly Demon Can't Live a Normal Life");
    });

    it('Should not glue a leading article into a possessive', () => {
        expect(SeriesTitleFromSlug('the-s-classes-that-i-raised')).toBe('The S Classes That I Raised');
    });

    it('Should keep numbers and ignore empty segments', () => {
        expect(SeriesTitleFromSlug('19th-century-s-wordsmith')).toBe("19th Century's Wordsmith");
        expect(SeriesTitleFromSlug('nano--machine')).toBe('Nano Machine');
    });
});

describe('ChapterTitleFromSlug', () => {

    it('Should render an integral chapter number', () => {
        expect(ChapterTitleFromSlug('chapter-331')).toBe('Chapter 331');
    });

    it('Should render a decimal chapter number', () => {
        expect(ChapterTitleFromSlug('chapter-113-5')).toBe('Chapter 113.5');
        expect(ChapterTitleFromSlug('chapter-113.5')).toBe('Chapter 113.5');
    });

    it('Should fall back to a title-like rendering for unexpected slugs', () => {
        expect(ChapterTitleFromSlug('extra-chapter')).toBe('Extra Chapter');
    });
});

describe('MapChapterNumber', () => {

    it('Should extract an integral chapter number', () => {
        expect(MapChapterNumber('chapter-1')).toBe(1);
        expect(MapChapterNumber('chapter-331')).toBe(331);
    });

    it('Should extract a decimal chapter number', () => {
        expect(MapChapterNumber('chapter-113-5')).toBe(113.5);
        expect(MapChapterNumber('chapter-113.5')).toBe(113.5);
    });

    it('Should return NaN for slugs without a chapter number', () => {
        expect(Number.isNaN(MapChapterNumber('extra-chapter'))).toBe(true);
    });
});

describe('MapChapterTitle', () => {

    it('Should prefix the chapter number when the website title does not contain one', () => {
        expect(MapChapterTitle(CreateChapter({ slug: 'chapter-331', number: 331, title: '107: Special Forces <4>' }))).toBe('Chapter 331 - 107: Special Forces <4>');
        expect(MapChapterTitle(CreateChapter({ slug: 'chapter-200', number: 200, title: "68. I'm No General (2)" }))).toBe("Chapter 200 - 68. I'm No General (2)");
    });

    it('Should keep website titles which already contain a chapter number', () => {
        expect(MapChapterTitle(CreateChapter({ slug: 'chapter-54', number: 54, title: 'Chapter 54' }))).toBe('Chapter 54');
        expect(MapChapterTitle(CreateChapter({ slug: 'chapter-519-5', number: 519.5, title: 'Ch.519.5 Jun 08,2026' }))).toBe('Ch.519.5 Jun 08,2026');
    });

    it('Should fall back to the chapter number when the website provides no title', () => {
        expect(MapChapterTitle(CreateChapter({ slug: 'chapter-200', number: 200, title: '' }))).toBe('Chapter 200');
        expect(MapChapterTitle(CreateChapter({ slug: 'chapter-7', number: Number.NaN, title: '' }))).toBe('Chapter 7');
    });

    it('Should fall back to the title when no chapter number is available', () => {
        expect(MapChapterTitle(CreateChapter({ slug: 'chapter-7', number: Number.NaN, title: 'Extra' }))).toBe('Extra');
    });
});

describe('LocalizeChapterWord', () => {

    it('Should localize the leading chapter word for the locales rendered in their language by the website', () => {
        expect(LocalizeChapterWord('Chapter 1', 'fr')).toBe('Chapitre 1');
        expect(LocalizeChapterWord('Chapter 1', 'es')).toBe('Capítulo 1');
        expect(LocalizeChapterWord('Chapter 113.5', 'fr')).toBe('Chapitre 113.5');
        expect(LocalizeChapterWord('Chapter 1 - Start Reading', 'fr')).toBe('Chapitre 1 - Start Reading');
        expect(LocalizeChapterWord('Chapter 331 - 107: Special Forces <4>', 'es')).toBe('Capítulo 331 - 107: Special Forces <4>');
    });

    it('Should localize abbreviated chapter words', () => {
        expect(LocalizeChapterWord('Ch.519.5 Jun 08,2026', 'fr')).toBe('Chapitre 519.5 Jun 08,2026');
        expect(LocalizeChapterWord('Ch 2 Bonus', 'fr')).toBe('Chapitre 2 Bonus');
    });

    it('Should keep the English chapter word for locales which the website renders in English', () => {
        expect(LocalizeChapterWord('Chapter 1', 'en')).toBe('Chapter 1');
        expect(LocalizeChapterWord('Chapter 1', 'de')).toBe('Chapter 1');
        expect(LocalizeChapterWord('Chapter 1', 'pt')).toBe('Chapter 1');
        expect(LocalizeChapterWord('Chapter 1', 'id')).toBe('Chapter 1');
        expect(LocalizeChapterWord('Chapter 1', 'ar')).toBe('Chapter 1');
        expect(LocalizeChapterWord('Chapter 1', 'tr')).toBe('Chapter 1');
    });

    it('Should be idempotent for titles which are already localized', () => {
        expect(LocalizeChapterWord('Chapitre 1', 'fr')).toBe('Chapitre 1');
        expect(LocalizeChapterWord('Capítulo 1 - Start Reading', 'es')).toBe('Capítulo 1 - Start Reading');
    });

    it('Should not touch titles which do not start with a chapter word', () => {
        expect(LocalizeChapterWord('Start Reading', 'fr')).toBe('Start Reading');
        expect(LocalizeChapterWord('107: Special Forces <4>', 'fr')).toBe('107: Special Forces <4>');
        expect(LocalizeChapterWord('Chaos Reign', 'fr')).toBe('Chaos Reign');
        expect(LocalizeChapterWord('Extra', 'fr')).toBe('Extra');
    });
});

describe('KomaScans', () => {

    const scraper = new KomaScans();

    it('Should expose the expected plugin metadata', () => {
        expect(scraper.Identifier).toBe('komascans');
        expect(scraper.Title).toBe('KomaScans');
        expect(scraper.URI.href).toBe('https://komascans.com/');
    });

    describe('ValidateMangaURL', () => {

        it('Should accept series URLs', () => {
            expect(scraper.ValidateMangaURL('https://komascans.com/en/series/nano-machine')).toBe(true);
            expect(scraper.ValidateMangaURL('https://komascans.com/fr/series/the-greatest-estate-developer')).toBe(true);
        });

        it('Should accept chapter URLs', () => {
            expect(scraper.ValidateMangaURL('https://komascans.com/en/read/nano-machine/chapter-1')).toBe(true);
            expect(scraper.ValidateMangaURL('https://komascans.com/en/read/nano-machine/chapter-113-5')).toBe(true);
        });

        it('Should tolerate a trailing query, hash or slash', () => {
            expect(scraper.ValidateMangaURL('https://komascans.com/en/series/nano-machine?page=2')).toBe(true);
            expect(scraper.ValidateMangaURL('https://komascans.com/en/series/nano-machine#chapters')).toBe(true);
            expect(scraper.ValidateMangaURL('https://komascans.com/en/series/nano-machine/')).toBe(true);
        });

        it('Should reject unrelated or foreign URLs', () => {
            expect(scraper.ValidateMangaURL('https://komascans.com/en/browse?page=2')).toBe(false);
            expect(scraper.ValidateMangaURL('https://komascans.com/en/series')).toBe(false);
            expect(scraper.ValidateMangaURL('https://example.com/en/series/nano-machine')).toBe(false);
        });
    });
});
