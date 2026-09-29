import { Tags, type Tag } from '../../../engine/Tags';
import { GlobalSettings } from '../stores/Settings.svelte';

const availableLanguageTags = Tags.Language.toArray();

/** Matches the emoji which prefixes the title of a language (e.g. the flag `🇫🇷` or the globe `🌐`). */
const LEADING_FLAG = /^[\p{RI}\p{Extended_Pictographic}\uFE0F]+/u;

/**
 * Extracts the unicode flag prefix (e.g. `🇫🇷`) of the first language tag within the given tags.
 * @param tags - The tags of a media container (e.g. the series of a website)
 * @returns The unicode flag of the detected language, or an empty string if no language is known
 * @remarks This relies on all localized language tags having a unicode emoji prefix in their corresponding title,
 * which allows to distinguish the language variants of a multilingual website within a list of identical titles.
 */
export function ExtractUnicodeFlagFromTags(tags: ReadonlyArray<Tag>): string {
    const resourceKey = tags.find(tag => availableLanguageTags.includes(tag))?.Title;
    const title = GlobalSettings.Locale[resourceKey]?.call(undefined) ?? '';
    return LEADING_FLAG.exec(title)?.[0] ?? '';
}
