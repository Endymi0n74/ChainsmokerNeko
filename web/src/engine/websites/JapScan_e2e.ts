import { TestFixture } from '../../../test/WebsitesFixture';

// CASE: Single Reader (Manga)
new TestFixture({
    plugin: {
        id: 'japscan',
        title: 'JapScan'
    },
    container: {
        url: 'https://www.japscan.foo/manga/jujutsu-kaisen/',
        id: '/manga/jujutsu-kaisen/',
        title: 'Jujutsu Kaisen'
    },
    child: {
        id: '/manga/jujutsu-kaisen/1/',
        title: 'Chapitre 1: Esprit à double-face',
        timeout: 30_000
    },
    entry: {
        index: 2,
        size: 246_579,
        type: 'image/png'
    }
}).AssertWebsite();

// CASE: Full Reader (Manhwa)
new TestFixture({
    plugin: {
        id: 'japscan',
        title: 'JapScan'
    },
    container: {
        url: 'https://www.japscan.foo/manhwa/king-game/',
        id: '/manhwa/king-game/',
        title: 'King Game'
    },
    child: {
        id: '/manhwa/king-game/1/',
        title: 'Chapitre 1',
        timeout: 30_000
    },
    entry: {
        index: 0,
        size: 173_855,
        type: 'image/jpeg'
    }
}).AssertWebsite();

// CASE: Volume Reader (Dreamland volume 24 — page-selector walk recovery)
new TestFixture({
    plugin: {
        id: 'japscan',
        title: 'JapScan'
    },
    container: {
        url: 'https://www.japscan.foo/manga/dreamland/',
        id: '/manga/dreamland/',
        title: 'Dreamland'
    },
    child: {
        id: '/manga/dreamland/volume-24/',
        title: 'Volume 24',
        timeout: 300_000 // 5 min budget for volume reader with page-selector walk
    },
    entry: {
        index: 0,
        size: 100_000, // placeholder — will be adjusted after first run
        type: 'image/jpeg'
    }
}).AssertWebsite();