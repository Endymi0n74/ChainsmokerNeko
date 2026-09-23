import { TestFixture } from '../../../test/WebsitesFixture';

new TestFixture({
    plugin: {
        id: 'mangamoins',
        title: 'MangaMoins'
    },
    container: {
        url: 'https://mangamoins.com/manga/one_piece',
        id: '/manga/one_piece',
        title: 'One Piece'
    },
    child: {
        id: 'OP1191',
        title: 'Ch. 1191 Loki est là'
    },
    entry: {
        index: 0,
        size: 500_000,
        type: 'image/webp'
    }
}).AssertWebsite();
