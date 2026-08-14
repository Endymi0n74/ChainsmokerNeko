<script lang="ts">
    import { onMount } from 'svelte';
    import { Button, Tile, Tag, ClickableTile } from 'carbon-components-svelte';
    import CaretRight from 'carbon-icons-svelte/lib/CaretRight.svelte';
    import { Store as UI } from '../../stores/Stores.svelte';
    import { Tags } from '../../../../engine/Tags';
    import { OpenLoginWindow } from '../../../../engine/platform/RemoteBrowserWindow';
    import type { Bookmark } from '../../../../engine/providers/Bookmark';
    import type { MediaChild, MediaContainer, MediaItem } from '../../../../engine/providers/MediaPlugin';

    type NewChapter = {
        bookmark: Bookmark;
        chapter: MediaContainer<MediaChild>;
    };

    let results: NewChapter[] = $state([]);
    let checking = $state(false);
    let lastChecked: Date | null = $state(null);
    let failures: string[] = $state([]);

    function isChapter(entry: MediaChild): entry is MediaContainer<MediaChild> {
        return entry !== null && typeof entry === 'object' && 'Tags' in entry && 'Title' in entry;
    }

    function isEnglish(chapter: MediaContainer<MediaChild>): boolean {
        return chapter.Tags.Value.some(tag => tag === Tags.Language.English);
    }

    async function check() {
        if (checking) return;
        checking = true;
        const found: NewChapter[] = [];
        const broken: string[] = [];

        for (const bookmark of window.HakuNeko.BookmarkPlugin.Entries.Value) {
            try {
                // Refresh the chapter list from the website, then detect unseen chapters.
                await bookmark.Update();
                const unflagged = await bookmark.GetUnflaggedContent();
                for (const entry of unflagged) {
                    if (isChapter(entry) && isEnglish(entry)) {
                        found.push({ bookmark, chapter: entry });
                    }
                }
            } catch (error) {
                broken.push(`${bookmark.Title} (${bookmark.Parent.Identifier})`);
            }
        }

        results = found;
        failures = broken;
        lastChecked = new Date();
        checking = false;
    }

    function openChapter(item: NewChapter) {
        UI.selectedPlugin = window.HakuNeko.BookmarkPlugin;
        UI.selectedMedia = item.bookmark;
        UI.selectedItem = item.chapter as MediaContainer<MediaItem>;
        UI.contentscreen = '/';
    }

    function loginToMangaDrama() {
        OpenLoginWindow(new URL('https://mangadrama.com/my-account/'));
    }

    onMount(() => {
        check();
    });
</script>

<div id="newchapterspage">
    <Tile id="newchapters" class="border">
        <div class="toolbar">
            <h4>New English Chapters</h4>
            <div class="actions">
                <Button size="small" onclick={check} disabled={checking}>
                    {checking ? 'Checking…' : 'Check bookmarks'}
                </Button>
                <Button size="small" kind="ghost" onclick={loginToMangaDrama}>
                    Login to MangaDrama
                </Button>
            </div>
        </div>

        {#if lastChecked}
            <p class="summary">
                {#if results.length === 0}
                    No new English chapters
                    {#if failures.length > 0} (some bookmarks failed) {/if}.
                {:else}
                    {results.length} new English chapter{results.length === 1 ? '' : 's'} found.
                {/if}
                Checked {lastChecked.toLocaleTimeString()}.
            </p>
        {/if}

        {#if failures.length > 0}
            <p class="failures">
                Could not check: {failures.join(', ')}
            </p>
        {/if}

        {#each results as item (item.bookmark.Identifier + '::' + item.chapter.Identifier)}
            <ClickableTile class="chaptertile" light on:click={() => openChapter(item)}>
                <span class="chaptertitle" title={item.chapter.Title}>
                    {item.chapter.Title}
                </span>
                <Tag class="sourcetitle" type="outline">
                    {item.bookmark.Title}
                </Tag>
                <CaretRight class="caret" size={20} />
            </ClickableTile>
        {/each}
    </Tile>
</div>

<style>
    #newchapterspage {
        padding: 0.5em;
        height: 100%;
    }
    #newchapterspage :global(#newchapters) {
        margin-bottom: 1em;
        height: 100%;
        overflow: auto;
        display: flex;
        flex-direction: column;
        gap: 0.5em;
    }
    .toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5em;
        flex-wrap: wrap;
    }
    .toolbar h4 {
        margin: 0;
    }
    .actions {
        display: flex;
        gap: 0.5em;
    }
    .summary {
        margin: 0;
        opacity: 0.8;
    }
    .failures {
        margin: 0;
        color: var(--cds-text-error, #da1e28);
    }
    :global(.chaptertile) {
        display: flex;
        align-items: center;
        gap: 0.5em;
        padding: 0.5em !important;
    }
    .chaptertitle {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .caret {
        flex: none;
    }
</style>
