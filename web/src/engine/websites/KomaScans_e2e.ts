import { TestFixture } from '../../../test/WebsitesFixture';

new TestFixture({
    plugin: {
        id: 'komascans',
        title: 'KomaScans',
    },
    container: {
        url: 'https://komascans.com/en/series/nano-machine',
        id: '/en/series/nano-machine',
        title: 'Nano Machine',
        // The series is truncated within its series page, hence the chapter list is completed from the sitemaps (~40s).
        timeout: 180_000,
    },
    child: {
        id: '/en/read/nano-machine/chapter-1',
        title: 'Chapter 1 - Start Reading',
        timeout: 30_000,
    },
    entry: {
        index: 0,
        size: 158_288,
        type: 'image/webp',
        timeout: 30_000,
    }
}).AssertWebsite();
