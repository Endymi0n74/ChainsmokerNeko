import { TestFixture } from '../../../test/WebsitesFixture';

new TestFixture({
    plugin: {
        id: 'readcomicsonline',
        title: 'Read Comics Online',
    },
    container: {
        url: 'https://readcomicsonline.lol/comic/Action-Comics-2016',
        id: '/comic/Action-Comics-2016',
        title: 'Action Comics (2016)',
    },
    child: {
        id: '/comic/Action-Comics-2016/1103',
        title: '#1103',
    },
    entry: {
        index: 0,
        size: 641_222,
        type: 'image/webp',
    }
}).AssertWebsite();
