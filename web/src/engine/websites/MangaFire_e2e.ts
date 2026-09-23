import { TestFixture } from '../../../test/WebsitesFixture';

// CASE: Chapter (English)
// NOTE: the previous fixture used 'pvzy-vagabondd' (Vagabond), which has been removed from
// MangaFire (404 "Not found"). Verified against an active title on 2026-08-16.
new TestFixture({
    plugin: {
        id: 'mangafire',
        title: 'MangaFire'
    },
    container: {
        url: 'https://mangafire.to/title/gl3-gun-x-clover',
        id: 'gl3-gun-x-clover',
        title: 'Gun X Clover',
        timeout: 10_000
    },
    child: {
        id: '156',
        title: 'Ch. 60 Love & Clover (unofficial) (en)'
    },
    entry: {
        index: 0,
        size: 391_961,
        type: 'image/jpeg'
    }
}).AssertWebsite();
