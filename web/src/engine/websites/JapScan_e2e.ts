import { TestFixture } from '../../../test/WebsitesFixture';

// Manual solve budget: the Cloudflare / JapScan puzzle is resolved by the user in the visible reader window.
const MANUAL_SOLVE_TIMEOUT = 300_000;

// CASE: Single Reader (Manga)
new TestFixture({
    plugin: {
        id: 'japscan',
        title: 'JapScan',
        timeout: MANUAL_SOLVE_TIMEOUT
    },
    container: {
        url: 'https://www.japscan.foo/manga/jujutsu-kaisen/',
        id: '/manga/jujutsu-kaisen/',
        title: 'Jujutsu Kaisen',
        timeout: MANUAL_SOLVE_TIMEOUT
    },
    child: {
        id: '/manga/jujutsu-kaisen/1/',
        title: 'Chapitre 1: Esprit à double-face',
        timeout: MANUAL_SOLVE_TIMEOUT
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
        title: 'JapScan',
        timeout: MANUAL_SOLVE_TIMEOUT
    },
    container: {
        url: 'https://www.japscan.foo/manhwa/king-game/',
        id: '/manhwa/king-game/',
        title: 'King Game',
        timeout: MANUAL_SOLVE_TIMEOUT
    },
    child: {
        id: '/manhwa/king-game/1/',
        title: 'Chapitre 1',
        timeout: MANUAL_SOLVE_TIMEOUT
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
        title: 'JapScan',
        timeout: MANUAL_SOLVE_TIMEOUT
    },
    container: {
        url: 'https://www.japscan.foo/manga/dreamland/',
        id: '/manga/dreamland/',
        title: 'Dreamland',
        timeout: MANUAL_SOLVE_TIMEOUT
    },
    child: {
        id: '/manga/dreamland/volume-24/',
        title: 'Volume 24',
        timeout: 300_000 // 5 min budget for volume reader with page-selector walk
    },
    entry: {
        index: 0,
        size: 194_063, // measured on the first live run
        type: 'image/jpeg'
    }
}).AssertWebsite();