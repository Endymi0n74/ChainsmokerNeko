<script lang="ts">

    import { Button, InlineNotification, Loading } from 'carbon-components-svelte';
    import Misuse from 'carbon-icons-svelte/lib/Misuse.svelte';
    import type { MediaContainer, MediaItem } from '../../../../engine/providers/MediaPlugin';
    import ImageViewer from './ImageViewer.svelte';
    import VideoViewer from './VideoViewer.svelte';
    import { Store as UI } from '../../stores/Stores.svelte';
    import { Settings } from '../../stores/Settings.svelte';
    import { FlagType } from '../../../../engine/ItemflagManager';

    interface Props {
        mode?: 'Image' | 'Video';
        item: MediaContainer<MediaItem>;
    }
    let { mode = 'Image', item }: Props = $props();

    let displayedItem: MediaContainer<MediaItem> = $state();;
    let currentImageIndex: number = $state(-1);

    let updating: Promise<void> = $derived.by(() =>
        item.Update()
            .then(() => { displayedItem = item; })
            .catch((error) => { displayedItem = undefined; throw error; })
    );

    function onPreviousItem() {
        currentImageIndex = -1;
        UI.selectedItem = UI.selectedItemPrevious;
    }
    function onNextItem() {
        currentImageIndex = -1;
        if (wide && !UI.selectedItemNext) HakuNeko.ItemflagManager.FlagItem(item, FlagType.Current);
        UI.selectedItem = UI.selectedItemNext;
    }
    function onClose() {
        HakuNeko.ItemflagManager.FlagItem(item, FlagType.Current);
    }

    function onCloseReader() {
        if (Settings.ViewerFlagCurrentOnClose.Value) {
            HakuNeko.ItemflagManager.FlagItem(item, FlagType.Current);
        }
        UI.selectedItem = null;
    }

    // Close the reader (return to the item list) with the Escape key when not in wide mode.
    $effect(() => {
        if (wide) return;
        const handler = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onCloseReader();
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    });

    let wide = $state(false);
</script>

<div id="Viewer" class="{mode} center" class:wide>
    {#if !wide}
        <Button
            class="closereader"
            kind="ghost"
            size="small"
            icon={Misuse}
            iconDescription="Close reader"
            tooltipPosition="bottom"
            tooltipAlignment="end"
            onclick={onCloseReader}
        />
    {/if}
    {#await updating}
        <div class="info loading">
            <div class="center"><Loading withOverlay={false} /></div>
            <div class="center">... items</div>
        </div>
    {:catch error}
        <InlineNotification
        title={error.name}
        subtitle="Unable to load item : {error.message}"
        class="info error"
        />
    {/await}
    {#if displayedItem}
        {#key displayedItem}
            {#if mode === 'Image'}
                <ImageViewer
                    item={displayedItem}
                    {currentImageIndex}
                    bind:wide
                    {onNextItem}
                    {onPreviousItem}
                    {onClose}
                    {onCloseReader}
                />
            {:else if mode === 'Video'}
                <VideoViewer />
            {:else}
                Unknown mode requested
            {/if}
        {/key}
    {/if}
</div>

<style>
    #Viewer {
        position: relative;
        width: 100%;
        height: 100%;
        padding: 0.5em;
        background-image: none;
        background-size: cover;
        background-repeat: no-repeat;
        background-position: left top;
        user-select: none;
        grid-area: Content;
    }
    #Viewer.wide {
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        position: absolute;
        z-index: 10000;
        -webkit-app-region: no-drag;
        padding: 0;
        background-color: var(--cds-ui-01);
    }
    #Viewer .info {
        position: absolute;
        z-index: 10001;
    }
    :global(#Viewer .closereader) {
        position: absolute;
        top: 0.4em;
        right: 0.4em;
        z-index: 10001;
        opacity: 0.65;
    }
    :global(#Viewer .closereader:hover) {
        opacity: 1;
    }
    .error {
        color: red;
    }

    .hide {
        display: none;
    }
</style>
