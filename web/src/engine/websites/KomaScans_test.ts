import { describe, it, expect } from 'vitest';
import '../RegExpSafe';
import KomaScans, { ResolveSeriesIdentifier, SeriesTitleFromSlug, ChapterTitleFromSlug, MapChapterNumber, MapChapterTitle, LocalizeChapterWord, PrepareOverlayTextLayout, FitPreparedOverlayRegion, LayoutOverlayTextBlock, EstimateOverlayWidth, EstimateComicReliefWidth, EstimateOverlayVerticalWidth, NormalizeOverlayLines, SanitizeOverlayText, BreakOverlayWords, WrapOverlayLines, FitOverlayTextToBox, IsValidOverlayCleanup, ResolveOverlayAssetUrl, IsOverlayLettering, ParseOverlayFontStacks, type HydratedChapter, type TranslationOverlay, type PreparedOverlayRegion } from './KomaScans';
import { Tags } from '../Tags';

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

/**
 * Builds a translation overlay which mirrors the payload of the first page of chapter 1 of The Greatest Estate Developer.
 */
function CreateOverlay(values: Partial<TranslationOverlay> = {}): TranslationOverlay {
    return {
        schemaVersion: 1,
        canvas: { width: 800, height: 11130 },
        cleanLayerUrl: 'https://komascans.com/_next/static/media/koma-salad-123.png',
        regions: [
            {
                id: 'r0003',
                kind: 'dialogue',
                sourceText: 'MY NAME IS SUHO KIM.',
                readingOrder: 0,
                textBox: { x: 235, y: 4549, width: 421, height: 135 },
                rotation: 0,
                cleanup: { kind: 'patch', box: { x: 190, y: 4535, width: 518, height: 159 } },
                style: { fontFamily: 'latin-dialogue', color: '#000000', fontWeight: 600, fontStyle: 'normal', textAlign: 'center', verticalAlign: 'middle', direction: 'ltr', writingMode: 'horizontal-tb' },
            },
            {
                id: 'r0004',
                kind: 'dialogue',
                sourceText: 'BBO!',
                readingOrder: 1,
                textBox: { x: 203, y: 7138, width: 162, height: 94 },
                rotation: 0,
                cleanup: { kind: 'patch', box: { x: 163, y: 7087, width: 234, height: 187 } },
                style: { fontFamily: 'latin-dialogue', color: '#000000', fontWeight: 600, fontStyle: 'normal', textAlign: 'center', verticalAlign: 'middle', direction: 'ltr', writingMode: 'horizontal-tb' },
            },
        ],
        translation: {
            schemaVersion: 1,
            language: 'fr',
            regions: [
                { regionId: 'r0003', text: 'Je m\'appelle Suho Kim.', lines: [ 'Je m\'appelle', 'Suho Kim.' ], fontSize: 56, lineHeight: 1.08, direction: 'ltr', fontFamily: 'latin-dialogue', visible: true },
                { regionId: 'r0004', text: 'BBO !', lines: [ 'BBO !' ], fontSize: 53.3, lineHeight: 1.08, direction: 'ltr', fontFamily: 'latin-dialogue', visible: true },
            ],
        },
        ...values,
    };
}

describe('PrepareOverlayTextLayout', () => {

    it('Should merge the translations with their source regions', () => {
        const regions = PrepareOverlayTextLayout(CreateOverlay());
        expect(regions.map(region => region.region.id)).toEqual([ 'r0003', 'r0004' ]);
        expect(regions[0].language).toBe('fr');
        expect(regions[0].box).toEqual({ x: 235, y: 4549, width: 421, height: 135 });
        expect(regions[0].color).toBe('#000000');
        expect(regions[0].verticalAlign).toBe('middle');
    });

    it('Should render dialogue text in upper case like the website', () => {
        const [ first, second ] = PrepareOverlayTextLayout(CreateOverlay());
        expect(first.lines).toEqual([ 'JE M\'APPELLE', 'SUHO KIM.' ]);
        expect(second.lines).toEqual([ 'BBO!' ]);
    });

    it('Should reflow dialogue text into its balloon and force the dialogue font weight', () => {
        const [ first, second ] = PrepareOverlayTextLayout(CreateOverlay());
        expect(first.fontSize).toBe(50);
        expect(second.fontSize).toBe(59);
        expect(first.lineHeight).toBe(1.02);
        expect(first.fontWeight).toBe(700);
        expect(first.fontFamily).toBe('latin-dialogue');
        expect(first.preserveNaturalGlyphWidth).toBe(true);
        expect(first.runtimeFitRequired).toBe(true);
        expect(first.stroke).toBeUndefined();
        expect(first.shadow).toBeUndefined();
    });

    it('Should keep the payload of text which is not lettered', () => {
        const overlay = CreateOverlay({
            regions: [ {
                id: 'r0010',
                kind: 'narration',
                sourceText: 'Meanwhile...',
                readingOrder: 0,
                textBox: { x: 10, y: 10, width: 300, height: 80 },
                rotation: 0,
                cleanup: { kind: 'preserve' },
                style: { fontFamily: 'latin-narration', color: '#FFFFFF', fontWeight: 400, fontStyle: 'normal', textAlign: 'left', verticalAlign: 'top', direction: 'ltr', writingMode: 'horizontal-tb' },
            } ],
            translation: { schemaVersion: 1, language: 'fr', regions: [ { regionId: 'r0010', text: 'Pendant ce temps...', lines: [ 'Pendant ce temps...' ], fontSize: 32, lineHeight: 1.1, direction: 'ltr', fontFamily: 'latin-narration', visible: true } ] },
        });
        const [ region ] = PrepareOverlayTextLayout(overlay);
        expect(region.lines).toEqual([ 'Pendant ce temps...' ]);
        expect(region.fontFamily).toBe('latin-narration');
        expect(region.fontWeight).toBe(400);
        expect(region.fontSize).toBe(28);
        expect(region.preserveNaturalGlyphWidth).toBe(false);
        expect(region.runtimeFitRequired).toBe(false);
        expect(region.glyphHeightRatio).toBe(1.5);
    });

    it('Should apply the guards of the website', () => {
        expect(PrepareOverlayTextLayout(CreateOverlay({ schemaVersion: 2 }))).toHaveLength(0);
        expect(PrepareOverlayTextLayout(CreateOverlay({ canvas: { width: 0, height: 10 } }))).toHaveLength(0);
        const invalidLanguage = CreateOverlay();
        invalidLanguage.translation.language = 'fr!';
        expect(PrepareOverlayTextLayout(invalidLanguage)).toHaveLength(0);
        const invalidSchema = CreateOverlay();
        invalidSchema.translation.schemaVersion = 9;
        expect(PrepareOverlayTextLayout(invalidSchema)).toHaveLength(0);
        expect(PrepareOverlayTextLayout(CreateOverlay({ regions: [] }))).toHaveLength(0);
    });

    it('Should skip translations which the website does not render', () => {
        const hidden = CreateOverlay();
        hidden.translation.regions[1].visible = false;
        expect(PrepareOverlayTextLayout(hidden).map(region => region.region.id)).toEqual([ 'r0003' ]);

        const unknown = CreateOverlay();
        unknown.translation.regions[0].regionId = 'r9999';
        expect(PrepareOverlayTextLayout(unknown).map(region => region.region.id)).toEqual([ 'r0004' ]);

        const duplicated = CreateOverlay();
        duplicated.translation.regions[0].regionId = 'r0004';
        expect(PrepareOverlayTextLayout(duplicated).map(region => region.region.id)).toEqual([ 'r0004' ]);

        const duplicatedSource = CreateOverlay();
        duplicatedSource.regions[1].id = 'r0003';
        expect(PrepareOverlayTextLayout(duplicatedSource)).toHaveLength(0);
    });

    it('Should reject regions without a valid text box or cleanup', () => {
        const brokenBox = CreateOverlay();
        brokenBox.regions[0].textBox = { x: 0, y: 0, width: 0, height: 10 };
        expect(PrepareOverlayTextLayout(brokenBox).map(region => region.region.id)).toEqual([ 'r0004' ]);

        const brokenCleanup = CreateOverlay();
        brokenCleanup.regions[1].cleanup = { kind: 'patch', box: { x: 0, y: 0, width: -1, height: 5 } };
        expect(PrepareOverlayTextLayout(brokenCleanup).map(region => region.region.id)).toEqual([ 'r0003' ]);

        const brokenColor = CreateOverlay();
        brokenColor.regions[0].style.color = 'black';
        expect(PrepareOverlayTextLayout(brokenColor).map(region => region.region.id)).toEqual([ 'r0004' ]);

        const brokenLineHeight = CreateOverlay();
        brokenLineHeight.translation.regions[0].lineHeight = 3;
        expect(PrepareOverlayTextLayout(brokenLineHeight).map(region => region.region.id)).toEqual([ 'r0004' ]);
    });
});

describe('FitPreparedOverlayRegion', () => {

    it('Should keep the prepared font size when the text already fits', () => {
        const [ region ] = PrepareOverlayTextLayout(CreateOverlay());
        expect(FitPreparedOverlayRegion(region)).toEqual({ fontSize: 50, offsetX: 0, offsetY: 0, pass: 0, status: 'fitted' });
    });

    it('Should shrink text which overflows its box', () => {
        const [ region ] = PrepareOverlayTextLayout(CreateOverlay());
        const prepared: PreparedOverlayRegion = { ...region, box: { x: 0, y: 0, width: 60, height: 40 } };
        expect(FitPreparedOverlayRegion(prepared)).toEqual({ fontSize: 8, offsetX: 0, offsetY: 0, pass: 1, status: 'fitted' });
    });

    it('Should mark text which cannot be fitted at all', () => {
        const [ region ] = PrepareOverlayTextLayout(CreateOverlay());
        const prepared: PreparedOverlayRegion = { ...region, box: { x: 0, y: 0, width: 0.6, height: 0.6 } };
        expect(FitPreparedOverlayRegion(prepared).status).toBe('overflow');
    });

    it('Should not fit regions which the website does not fit at runtime', () => {
        const [ region ] = PrepareOverlayTextLayout(CreateOverlay());
        const prepared: PreparedOverlayRegion = { ...region, runtimeFitRequired: false, fontSize: 120 };
        expect(FitPreparedOverlayRegion(prepared)).toEqual({ fontSize: 120, offsetX: 0, offsetY: 0, pass: 0, status: 'fitted' });
    });
});

describe('LayoutOverlayTextBlock', () => {

    const box = { x: 100, y: 200, width: 400, height: 150 };

    it('Should center multiple lines vertically and horizontally', () => {
        const layout = LayoutOverlayTextBlock({ box, fontSize: 20, glyphAscenderRatio: 1.02, glyphHeightRatio: 1.4, lineCount: 3, lineHeight: 1.2, textAlign: 'center', verticalAlign: 'middle', direction: 'ltr' });
        expect(layout.textAnchor).toBe('middle');
        expect(layout.dominantBaseline).toBe('alphabetic');
        expect(layout.linePositions[0]).toEqual({ x: 300, y: 257.4 });
        expect(layout.linePositions[2]).toEqual({ x: 300, y: 305.4 });
    });

    it('Should align the text according to the text alignment', () => {
        const left = LayoutOverlayTextBlock({ box, fontSize: 20, lineCount: 1, lineHeight: 1.2, textAlign: 'left', verticalAlign: 'top', direction: 'ltr' });
        expect(left.linePositions[0].x).toBe(100);
        expect(left.textAnchor).toBe('start');
        const right = LayoutOverlayTextBlock({ box, fontSize: 20, lineCount: 1, lineHeight: 1.2, textAlign: 'right', verticalAlign: 'bottom', direction: 'ltr' });
        expect(right.linePositions[0].x).toBe(500);
        expect(right.textAnchor).toBe('end');
    });

    it('Should mirror the anchor of a right-to-left writing direction', () => {
        const rtl = LayoutOverlayTextBlock({ box, fontSize: 20, lineCount: 1, lineHeight: 1.2, textAlign: 'left', verticalAlign: 'top', direction: 'rtl' });
        expect(rtl.textAnchor).toBe('end');
        const rtlRight = LayoutOverlayTextBlock({ box, fontSize: 20, lineCount: 1, lineHeight: 1.2, textAlign: 'right', verticalAlign: 'top', direction: 'rtl' });
        expect(rtlRight.textAnchor).toBe('start');
    });

    it('Should stack the columns of a vertical writing mode from right to left', () => {
        const layout = LayoutOverlayTextBlock({ box: { x: 0, y: 0, width: 300, height: 600 }, fontSize: 10, lineCount: 2, lineHeight: 1.5, textAlign: 'center', verticalAlign: 'middle', writingMode: 'vertical-rl' });
        expect(layout.textAnchor).toBe('middle');
        expect(layout.dominantBaseline).toBe('middle');
        expect(layout.linePositions).toEqual([ { x: 157.5, y: 300 }, { x: 142.5, y: 300 } ]);
    });
});

describe('Overlay text metrics', () => {

    it('Should estimate the width of a line by its glyph classes', () => {
        expect(EstimateOverlayWidth('AAA')).toBeCloseTo(1.86, 6);
        expect(EstimateOverlayWidth('...')).toBeCloseTo(0.9, 6);
        expect(EstimateOverlayWidth(' ')).toBeCloseTo(0.32, 6);
        expect(EstimateOverlayWidth('iii')).toBeCloseTo(0.9, 6);
        expect(EstimateOverlayWidth('WWW')).toBeCloseTo(2.46, 6);
    });

    it('Should estimate the width of a line with the metrics of the dialogue font', () => {
        expect(EstimateComicReliefWidth('A')).toBeCloseTo(0.731453125, 9);
        expect(EstimateComicReliefWidth(' ')).toBeCloseTo(0.298828125, 9);
        expect(EstimateComicReliefWidth('')).toBe(0);
        expect(EstimateComicReliefWidth('é')).toBeCloseTo(0.54, 6);
    });

    it('Should estimate the length of a line for vertical writing modes', () => {
        expect(EstimateOverlayVerticalWidth('a b')).toBeCloseTo(2.4, 6);
        expect(EstimateOverlayVerticalWidth('漫画')).toBe(2);
    });
});

describe('Overlay text helpers', () => {

    it('Should remove control characters from a line', () => {
        expect(SanitizeOverlayText('A\u0007B\u0000C\nD')).toBe('ABC\nD');
    });

    it('Should convert dialogue and sound effects to upper case', () => {
        expect(NormalizeOverlayLines([ 'Hello' ], 'latin-dialogue', 'fr', 'Hello world.')).toEqual([ 'HELLO' ]);
        expect(NormalizeOverlayLines([ 'Hello' ], 'comic-sfx', 'de', 'Hello world.')).toEqual([ 'HELLO' ]);
        expect(NormalizeOverlayLines([ 'Hello' ], 'latin-narration', 'fr', 'Hello world.')).toEqual([ 'Hello' ]);
        expect(NormalizeOverlayLines([ 'Hello' ], 'latin-narration', 'fr', 'HELLO WORLD.')).toEqual([ 'HELLO' ]);
    });

    it('Should keep trailing punctuation attached to the preceding word', () => {
        expect(BreakOverlayWords('Pay attention, now!')).toEqual([ 'Pay', 'attention,', 'now!' ]);
        expect(BreakOverlayWords('Wow !')).toEqual([ 'Wow!' ]);
        expect(BreakOverlayWords('  spaced   words  ')).toEqual([ 'spaced', 'words' ]);
    });

    it('Should balance the lines of a wrapped text', () => {
        expect(WrapOverlayLines('one two three four', 2)).toEqual([ 'one two', 'three four' ]);
        expect(WrapOverlayLines('one two three four', 1)).toEqual([ 'one two three four' ]);
        expect(WrapOverlayLines('', 3)).toEqual([]);
    });

    it('Should compute the largest font size which fits into a box', () => {
        const result = FitOverlayTextToBox('one two three four', { x: 0, y: 0, width: 200, height: 100 }, 2, 1.2);
        expect(result.lines).toEqual([ 'one two', 'three four' ]);
        expect(result.fontSize).toBe(33);
        expect(FitOverlayTextToBox('one two three four', { x: 0, y: 0, width: 4, height: 4 }, 2, 1.2)).toBeNull();
    });

    it('Should validate the cleanup of a region', () => {
        expect(IsValidOverlayCleanup({ kind: 'preserve' })).toBe(true);
        expect(IsValidOverlayCleanup({ kind: 'patch', box: { x: 1, y: 2, width: 3, height: 4 } })).toBe(true);
        expect(IsValidOverlayCleanup({ kind: 'patch', box: { x: 1, y: 2, width: 0, height: 4 } })).toBe(false);
        expect(IsValidOverlayCleanup({ kind: 'solid', color: '#ffffff', shape: { kind: 'ellipse', cx: 1, cy: 2, rx: 3, ry: 4 } })).toBe(true);
        expect(IsValidOverlayCleanup({ kind: 'solid', color: 'white', shape: { kind: 'ellipse', cx: 1, cy: 2, rx: 3, ry: 4 } })).toBe(false);
        expect(IsValidOverlayCleanup({ kind: 'solid', color: '#ffffff', shape: { kind: 'polygon', points: [ { x: 0, y: 0 }, { x: 1, y: 1 } ] } })).toBe(false);
        expect(IsValidOverlayCleanup(undefined)).toBe(false);
    });

    it('Should resolve the assets of the website', () => {
        expect(ResolveOverlayAssetUrl('/fonts/PatrickHandSC-Regular.ttf', 'https://komascans.com')).toBe('https://komascans.com/fonts/PatrickHandSC-Regular.ttf');
        expect(ResolveOverlayAssetUrl('https://komascans.com/_next/media/a.png', 'https://komascans.com')).toBe('https://komascans.com/_next/media/a.png');
        expect(ResolveOverlayAssetUrl('//komascans.com/a.png', 'https://komascans.com')).toBeNull();
        expect(ResolveOverlayAssetUrl('https://evil.example/a.png', 'https://komascans.com')).toBe('https://evil.example/a.png');
        expect(ResolveOverlayAssetUrl('http://komascans.com/a.png', 'https://komascans.com')).toBeNull();
        expect(ResolveOverlayAssetUrl(null, 'https://komascans.com')).toBeNull();
        expect(ResolveOverlayAssetUrl(`https://komascans.com/${'a'.repeat(3000)}`, 'https://komascans.com')).toBeNull();
    });

    it('Should detect lettered regions', () => {
        expect(IsOverlayLettering('dialogue')).toBe(true);
        expect(IsOverlayLettering('narration')).toBe(false);
        expect(IsOverlayLettering('narration', 'balloon')).toBe(true);
        expect(IsOverlayLettering('dialogue', 'caption')).toBe(false);
    });
});

describe('ParseOverlayFontStacks', () => {

    const stylesheet = `
        :root { --page-translation-overlay__font--latin-dialogue: "Comic Relief", "Kalam", system-ui, sans-serif; }
        .page-translation-overlay__font--latin-dialogue { font-family: var(--page-translation-overlay__font--latin-dialogue), ui-sans-serif; }
        .page-translation-overlay__font--latin-display { font-family: var(--page-translation-overlay__font--undefined); }
        @font-face { font-family: "Comic Relief"; src: url("https://komascans.com/_next/static/media/comic-3hd2l7bm32o7k.woff2") format("woff2"); font-weight: 400 700; font-style: normal; unicode-range: U+0000-00FF; }
        @font-face { font-family: "Kalam"; src: local("Kalam Regular"), url('https://komascans.com/fonts/kalam.woff2'); font-weight: 400; }
        @font-face { font-family: "Oswald"; src: url(https://komascans.com/_next/static/media/oswald.woff2); }
    `;

    it('Should resolve the font stack of a font key through its CSS variable', () => {
        const { stacks } = ParseOverlayFontStacks(stylesheet);
        expect(stacks.get('latin-dialogue')).toBe('"Comic Relief", "Kalam", system-ui, sans-serif, ui-sans-serif');
        expect(stacks.has('latin-display')).toBe(false);
    });

    it('Should strip the quotes which were added to the font URL', () => {
        const { faces } = ParseOverlayFontStacks(stylesheet);
        const comic = faces.find(face => face.family === 'Comic Relief');
        expect(comic?.source).toBe('https://komascans.com/_next/static/media/comic-3hd2l7bm32o7k.woff2');
        expect(comic?.weight).toBe('400 700');
        expect(comic?.style).toBe('normal');
        expect(comic?.unicodeRange).toBe('U+0000-00FF');
    });

    it('Should prefer the URL of a source over its local fonts', () => {
        const { faces } = ParseOverlayFontStacks(stylesheet);
        expect(faces.find(face => face.family === 'Kalam')?.source).toBe('https://komascans.com/fonts/kalam.woff2');
        expect(faces.find(face => face.family === 'Oswald')?.source).toBe('https://komascans.com/_next/static/media/oswald.woff2');
    });

    it('Should ignore font faces without a usable source', () => {
        const { faces } = ParseOverlayFontStacks('@font-face { font-family: "Only Local"; src: local("Only Local"); }');
        expect(faces).toEqual([]);
    });
});

describe('GetMangaTags', () => {

    const scraper = new KomaScans();

    it.each([
        [ '/fr/series/the-greatest-estate-developer', Tags.Language.French ],
        [ '/es/series/nano-machine', Tags.Language.Spanish ],
        [ '/tr/series/nano-machine', Tags.Language.Turkish ],
        [ '/pt/series/nano-machine', Tags.Language.Portuguese ],
        [ '/ar/series/nano-machine', Tags.Language.Arabic ],
        [ '/de/series/nano-machine', Tags.Language.German ],
        [ '/id/series/nano-machine', Tags.Language.Indonesian ],
        [ '/en/series/nano-machine', Tags.Language.English ],
        [ '/xx/series/nano-machine', Tags.Language.English ],
    ])('Should resolve the language tag of %s', (identifier, tag) => {
        expect(scraper.GetMangaTags(identifier)).toEqual([ tag ]);
    });
});
