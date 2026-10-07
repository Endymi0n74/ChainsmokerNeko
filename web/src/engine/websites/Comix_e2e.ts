import { TestFixture } from '../../../test/WebsitesFixture';

new TestFixture({
    plugin: {
        id: 'comix',
        title: 'Comix'
    },
    container: {
        url: 'https://comix.to/title/k7yg7-the-spark-in-your-eyes',
        id: '/title/k7yg7-the-spark-in-your-eyes',
        title: 'The Spark in Your Eyes',
        timeout: 15_000
    },
    child: {
        id: '/title/k7yg7-the-spark-in-your-eyes/11243755-chapter-232',
        title: '232 [Violet Scans]',
        timeout: 15_000
    },
    entry: {
        index: 0,
        size: 64_546,
        type: 'image/webp',
        timeout: 15_000
    }
}).AssertWebsite();
