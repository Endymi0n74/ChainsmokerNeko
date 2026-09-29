import { type ILocale, type LocaleID, type VariantResource, VariantResourceKey, InvariantResourceKey } from './ILocale';
import type { Choice } from '../engine/SettingsManager';
import { Scope, Key } from '../engine/SettingsGlobal';
import { invariant } from './locales/_invariant';
import ar_SA from './locales/ar_SA';
import de_DE from './locales/de_DE';
import en_US from './locales/en_US';
import es_ES from './locales/es_ES';
import fil_PH from './locales/fil_PH';
import fr_FR from './locales/fr_FR';
import hi_IN from './locales/hi_IN';
import id_ID from './locales/id_ID';
import pt_PT from './locales/pt_PT';
import th_TH from './locales/th_TH';
import tr_TR from './locales/tr_TR';
import zh_CN from './locales/zh_CN';
import crowdinPseudoLanguage from './locales/zu_ZA';

/**
 * List of all available localizations in the application.
 * See: https://www.localeplanet.com/icu/
 */
const resources: Record<LocaleID, ILocale> = {
    Locale_arSA: CreateLocale(ar_SA),
    Locale_deDE: CreateLocale(de_DE),
    Locale_enUS: CreateLocale(en_US),
    Locale_esES: CreateLocale(es_ES),
    Locale_filPH: CreateLocale(fil_PH),
    Locale_frFR: CreateLocale(fr_FR),
    Locale_hiIN: CreateLocale(hi_IN),
    Locale_idID: CreateLocale(id_ID),
    Locale_ptPT: CreateLocale(pt_PT),
    Locale_thTH: CreateLocale(th_TH),
    Locale_trTR: CreateLocale(tr_TR),
    Locale_zhCN: CreateLocale(zh_CN),
};

const crowdinPseudoResource = CreateLocale(crowdinPseudoLanguage);

function Format(this: string, ...params: string[]) {
    let text = this.toString();
    for(const index in params) {
        text = text.replace(`{${index}}`, params[index]);
        /*
        const regex = new RegExpSafe(`\\{${index}\\}`, 'g');
        text = text.replace(regex, params[index]);
        */
    }
    return text;
}

/**
 * Replaces the name of the original project with the name of this fork within a localization resource.
 * The localization files must not be modified (they are synchronized with Crowdin), hence the name is
 * replaced once while the resource is bound to its accessor.
 */
function ApplyBrandName(resource: unknown): string {
    // NOTE: The "HakuNeko Assistant" browser extension is an external product which keeps its original
    // name, written in the local language of each localization (e.g. "Asistente de HakuNeko", "助理").
    const guards: string[] = [ 'assistant', 'asistente', '助理', 'مساعد' ];
    return String(resource).replace(/\bHakuNeko\b|هاكونيكو/gi, (name: string, offset: number, source: string) => {
        const context = (source.slice(Math.max(0, offset - 24), offset) + source.slice(offset + name.length, offset + name.length + 24)).toLowerCase();
        return guards.some(guard => context.includes(guard)) ? name : 'ChainsmokerNeko';
    });
}

export function CreateLocale(resource: VariantResource): ILocale {
    const result = {};
    for(const key in InvariantResourceKey) {
        result[key] = Format.bind(ApplyBrandName(invariant[key] ?? key));
    }
    for(const key in VariantResourceKey) {
        result[key] = Format.bind(ApplyBrandName(resource[key] ?? key));
    }
    return result as ILocale;
}

/**
 * Search the localized resource for the given language code.
 * If no language code is given, it is determined from the global settings.
 */
export function GetLocale(code?: LocaleID): ILocale {
    if(code) {
        return resources[code];
    }
    if(HakuNeko?.FeatureFlags?.CrowdinTranslationMode?.Value) {
        return crowdinPseudoResource;
    }
    const active = HakuNeko.SettingsManager.OpenScope(Scope).Get<Choice>(Key.Language).Value as LocaleID;
    return resources[active];
}