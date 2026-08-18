export type MangaDramaChapterItem = {
    slug?: unknown;
    number?: unknown;
    title?: unknown;
    lock_type?: unknown;
    lock_value?: unknown;
    is_purchased?: unknown;
};

export type MangaDramaChapterView = {
    id: string;
    base: string;
    price: string;
    locked: boolean;
};

/**
 * Pure mapping from a MangaDrama chapter REST item to its UI view.
 *
 * This is the single source of truth for the chapter lock (🔒) indicator: a
 * chapter is locked only when it has a real `lock_type` AND the logged-in
 * user has not purchased it (`is_purchased !== true`). The function is also
 * inlined into the `FetchWindowScript` of `MangaDrama.ts` through
 * `Function.prototype.toString()`, so it must stay free of any external
 * references (no imports, no closures) - it has to remain self-contained.
 */
export function MapMangaDramaChapter(item: MangaDramaChapterItem): MangaDramaChapterView {
    const id = String(item.slug ?? '') || 'chapter-' + String(item.number);
    const number = item.number;
    const raw = String(item.title ?? '').replace(/\s+/g, ' ').trim();
    const plain = !raw || raw.toLowerCase() === 'chapter ' + String(number);
    const base = plain ? 'Chapter ' + String(number) : 'Chapter ' + String(number) + ' - ' + raw;
    const lockType = item.lock_type;
    const lockValue = Number(item.lock_value);
    const locked = Boolean(lockType && lockType !== 'none' && item.is_purchased !== true);
    const price = locked && lockType === 'coin' && lockValue > 0
        ? ' (' + String(item.lock_value) + ' coin' + (lockValue > 1 ? 's' : '') + ')'
        : '';
    return { id, base, price, locked };
}
