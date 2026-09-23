import { Tags } from '../Tags';
import icon from './MangaLink.webp';
import { DecoratableMangaScraper } from '../providers/MangaPlugin';
import * as Madara from './decorators/WordPressMadara';
import * as Common from './decorators/Common';
import { AddAntiScrapingDetection, FetchRedirection } from '../platform/AntiScrapingDetection';
import { FetchWindowScript } from '../platform/FetchProvider';
import { AddForkChallengeHandling } from '../platform/ChallengeReload';

AddAntiScrapingDetection(async (invoke) => {
    const result = await invoke<boolean>(`document.querySelector('form#lsrecaptcha-form[action*="/.lsrecap/recaptcha?"]') && true || false`);
    return result ? FetchRedirection.Interactive : undefined;
}, /^https:\/\/link-manga\.net/);
AddForkChallengeHandling(/^https:\/\/link-manga\.net/);

@Madara.MangaCSS(/^{origin}\/manga\/[^/]+\/$/)
@Madara.MangasMultiPageAJAX()
@Madara.ChaptersSinglePageAJAXv1()
@Madara.PagesSinglePageCSS()
@Common.ImageAjax()
export default class extends DecoratableMangaScraper {

    // MangaLink présente un reCAPTCHA interactif (form#lsrecaptcha-form) qui
    // nécessite une vraie fenêtre visible — la vérification silencieuse saute
    // donc ce site.
    public override readonly RequiresVisibleBrowserWindow = true;

    public constructor() {
        super('mangalink', 'MangaLink', 'https://link-manga.net', Tags.Media.Manga, Tags.Media.Manhwa, Tags.Media.Manhua, Tags.Language.Arabic, Tags.Source.Aggregator);
    }

    public override get Icon() {
        return icon;
    }

    public override async Initialize(): Promise<void> {
        return await FetchWindowScript(new Request(new URL('/manga/-/', this.URI)), '');
    }
}