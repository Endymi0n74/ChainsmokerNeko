import { Tags } from '../Tags';
import icon from './ReadComicsOnline.webp';
import { DecoratableMangaScraper } from '../providers/MangaPlugin';
import * as Common from './decorators/Common';

// The reader only keeps the currently displayed page inside the DOM, the complete page
// list is embedded in the Next.js streaming payload (`self.__next_f`) and thus has to be
// read back from there instead of from the rendered `img` elements.
const pageScript = String.raw`(() => {
    const payload = [...document.querySelectorAll('script')].map(node => node.textContent || '').join('');
    const links = payload.match(/https?:\/\/[^"'\s\\]+\.(?:webp|jpe?g|png|avif)/g) || [];
    return [...new Set(links)].filter(link => link.includes('/pages/'));
})()`;

@Common.MangaCSS(/^{origin}\/comic\/[^/]+$/, 'h1')
@Common.MangasSinglePageCSS('/comics?sort=az', 'div.grid > a[href^="/comic/"]', (anchor: HTMLAnchorElement) => ({
    id: anchor.pathname,
    title: anchor.querySelector('h3')?.textContent.trim() ?? anchor.innerText.trim(),
}))
@Common.ChaptersSinglePageCSS('a[data-smartlink="strong"][href^="/comic/"]', undefined, (anchor: HTMLAnchorElement) => ({
    id: anchor.pathname,
    title: (anchor.querySelector('span')?.textContent ?? anchor.innerText).trim(),
}))
@Common.PagesSinglePageJS(pageScript, 1000)
@Common.ImageAjax()
export default class extends DecoratableMangaScraper {

    public constructor() {
        super('readcomicsonline', 'Read Comics Online', 'https://readcomicsonline.lol', Tags.Language.English, Tags.Media.Comic, Tags.Source.Aggregator);
    }

    public override get Icon() {
        return icon;
    }
}
