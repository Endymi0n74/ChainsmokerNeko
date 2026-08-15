<script lang="ts">
    import { crossfade, fade } from 'svelte/transition';
    import { quintOut } from 'svelte/easing';
    import { onDestroy, onMount } from 'svelte';
    // Events

    interface Props {
        item: MediaContainer<MediaItem>;
        currentImageIndex: number;
        wide: boolean;
        onNextItem: () => void;
        onPreviousItem: () => void;
        onClose: () => void;
        onCloseReader: () => void;
    };

    // UI
    import { Button, InlineNotification } from 'carbon-components-svelte';
    import Download from 'carbon-icons-svelte/lib/Download.svelte';
    // engine
    import type {
        MediaContainer,
        MediaItem,
    } from '../../../../engine/providers/MediaPlugin';
    import { Priority } from '../../../../engine/taskpool/DeferredTask';
    // svelte component
    import ImageViewerWideSettings from './ImageViewerWideSettings.svelte';
    import Image from './Image.svelte';
    // stores
    import { Key, Settings } from '../../stores/Settings.svelte';
    import { Store as UI } from '../../stores/Stores.svelte';
    // others
    import { scrollSmoothly, scrollMagic, toggleFullScreen } from './utilities';
    import { dragscroll } from '@svelte-put/dragscroll';

    onMount(() => {
        viewer.addEventListener('scroll', onScroll);
    });

    onDestroy(() => {
        document.removeEventListener('keydown', onKeyDown);
        viewer?.removeEventListener('scroll', onScroll);
    });

    let { item, currentImageIndex, wide = $bindable(), onNextItem, onPreviousItem, onClose, onCloseReader }: Props = $props();
    let entries = $derived(item.Entries.Value);
    let viewer: HTMLElement;

    // Save all images of the current item (chapter pages) to disk.
    let savingAll = $state(false);
    let savedCount = $state(0);

    function downloadBlob(data: Blob, filename: string) {
        const url = URL.createObjectURL(data);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    async function saveAllImages() {
        if (savingAll) return;
        savingAll = true;
        savedCount = 0;
        const signal = new AbortController().signal;
        try {
            let index = 0;
            for (const page of entries) {
                const data = await page.Fetch(Priority.High, signal);
                if (data.type.startsWith('image')) {
                    const extension = data.type.split('/')[1]?.split('+')[0] || 'image';
                    downloadBlob(data, `image_${String(index + 1).padStart(3, '0')}.${extension}`);
                }
                index++;
                savedCount = index;
                await new Promise(resolve => setTimeout(resolve, 350));
            }
        } catch (error) {
            console.warn('saveAllImages', error);
        } finally {
            savingAll = false;
        }
    }

    function viewerclose() {
        wide = false;
        onClose();
    }

    function onKeyDown(event: KeyboardEvent) {
        switch (true) {
            case event.code === 'ArrowUp':
                scrollSmoothly(viewer, -64);
                break;
            case event.code === 'ArrowDown':
                scrollSmoothly(viewer, 64);
                break;
            case event.code === 'PageUp':
                viewer.scrollBy({
                    top: -window.innerHeight * 0.95,
                    left: 0,
                    behavior: 'smooth',
                });
                break;
            case event.code === 'PageDown':
                viewer.scrollBy({
                    top: window.innerHeight * 0.95,
                    left: 0,
                    behavior: 'smooth',
                });
                break;
            case event.code === 'ArrowRight':
                onNextItem();
                break;
            case event.code === 'ArrowLeft':
                onNextItem();
                break;
            case event.key === '*':
                Settings.ViewerZoom.Value = 100;
                break;
            case event.key === '/':
                Settings.ViewerZoom.Value=Settings.ViewerZoom.Setting.Default;
                break;
            case event.key === '+' && !event.ctrlKey:
                Settings.ViewerZoom.Increment();
                break;
            case event.key === '-' && !event.ctrlKey:
                Settings.ViewerZoom.Decrement();
                break;
            case event.key === '+' && event.ctrlKey:
                Settings.ViewerPadding.Increment();
                break;
            case event.key === '-' && event.ctrlKey:
                Settings.ViewerPadding.Decrement();
                break;
            case event.code === 'Escape':
                viewerclose();
                break;
            case event.code === 'Space':
                scrollMagic(
                    viewer,
                    '.imgpreview',
                    window.innerHeight * 0.8,
                    onNextItemCallback,
                );
                event.preventDefault();
                break;
            default:
                break;
        }
    }



    // Auto next item after reaching end of page
    let autoNextItem = $state(false);
    async function onNextItemCallback() {
        if (autoNextItem && UI.selectedItemNext) onNextItem();
        else {
            autoNextItem = true;
            setTimeout(function () {
                autoNextItem = false;
            }, 4000);
        }
    }

    async function onScroll() {
        const scrollableHeight = viewer.scrollHeight - viewer.clientHeight;
        if (viewer.scrollTop >= scrollableHeight) {
            if (!autoNextItem) onNextItemCallback();
        }
    }

    // Drag and drop scroll
    let pos = { top: 0, left: 0, x: 0, y: 0 };

    // Entering wide mode : scroll to image
    $effect(() => {
        if (wide) {
            if (currentImageIndex != -1) {
                // delay because of smooth transition
                setTimeout(() => {
                    const targetScrollImage =
                        viewer.querySelectorAll('ImageViewer>img')[
                            currentImageIndex
                        ];
                    targetScrollImage?.scrollIntoView({
                        behavior: 'smooth',
                        inline: 'center',
                    });
                    currentImageIndex = -1;
                }, 200);
            }
            document.addEventListener('keydown', onKeyDown);
        } else {
            document.removeEventListener('keydown', onKeyDown);
            if (viewer) viewer.style.userSelect = 'none';
        }
    });

    const [send, receive] = crossfade({
        duration: 1500,
        easing: quintOut,
    });
    const ViewerPadding = $derived(Settings.ViewerPadding.Value+'em');
</script>
{#if wide}
    <ImageViewerWideSettings
        {item}
        {onNextItem}
        {onPreviousItem}
        onClose={viewerclose}
        {onCloseReader}
        onSaveAllImages={saveAllImages}
        {savingAll}
    />
{/if}
{#if !wide && entries.length > 0}
    <Button
        class="saveallimages"
        kind="ghost"
        size="small"
        icon={Download}
        iconDescription={savingAll ? `Saving images (${savedCount}/${entries.length})…` : 'Save all images'}
        disabled={savingAll}
        onclick={saveAllImages}
    />
{/if}
<div
    id="ImageViewer"
    bind:this={viewer}
    role="button"
    tabindex="-1"
    ondblclick={() => toggleFullScreen()}
    transition:fade
    class:wide={wide}
    class:reverse={Settings.ViewerReverseDirection.Value}
    class="{Settings.ViewerMode.Value}"
    style:--viewer-padding={ViewerPadding}
    style:--image-zoom={Settings.ViewerZoomRatio}
    use:dragscroll={{ axis: 'both' }}
>

    {#if entries.length === 0}
        <div class="center" style="width:100%;height:100%;">
            <InlineNotification
                hideCloseButton
                kind="info"
                title="Nothing to show:"
                subtitle="content list is empty."
            />
        </div>
    {/if}

    {#each entries as content, index (index)}
        <button
            onclick={() => {
                currentImageIndex = index;
                wide = true;
            }}
            in:send={{ key: index }}
            out:receive={{ key: index }}
        >
            <Image
                {wide}
                alt="content_{index}"
                page={content}
            />
        </button>
    {/each}
</div>
{#if autoNextItem && UI.selectedItemNext !== undefined}
    <div  style="z-index: 20000; position: fixed; bottom: 2em; right: 2em;" transition:fade>
        <InlineNotification
            kind="info"
            title="Bottom reached"
            subtitle="Click or Press space again to go to next item."
            onclick={() => onNextItem()}
            on:close={() => (autoNextItem = false)}
        />
    </div>
{/if}

<style>
    button {
        all: unset;
        cursor: pointer;
    }
    #ImageViewer {
        width: 100%;
        height: 100%;
    }
    #ImageViewer:not(.wide) {
        overflow-y: auto;
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        align-content: flex-start;
    }

    #ImageViewer:not(.wide) :global(.imgpreview) {
        border: 2px solid var(--cds-ui-04);
        background-color: var(--cds-ui-01);
        box-shadow: 1em 1em 2em var(--cds-ui-01);
        border-radius: 1em;
        margin: 0.5em;
        width: 16em;
        height: 16em;
        min-width: 16em;
        min-height: 16em;
        max-width: 16em;
        max-height: 16em;
        cursor: pointer;
        object-fit: contain;
    }
    #ImageViewer.wide {
        overflow: auto;
        background-color: var(--cds-ui-01);
        cursor: grab;
        align-items: center;
        transition: gap 0.2s ease-in-out;
        gap: var(--viewer-padding);
        min-width: 0;
        min-height: 0;
    }
    #ImageViewer.wide :global(img.imgpreview)  {
        zoom : var(--image-zoom);
    }
    #ImageViewer.wide.longstrip {
        display: flex;
        flex-direction: column;
        overflow-y: auto;
    }
    #ImageViewer.wide.paginated {
        display: flex;
        flex-direction: row;
        flex-wrap: nowrap;
        align-items: center;
        height: 100%;
        overflow-x: auto;
    }
    /* TODO: implement RTL reading */
    #ImageViewer.wide.paginated.reverse {
        flex-flow: row-reverse;
    }

    :global(.saveallimages) {
        position: absolute;
        top: 0.4em;
        left: 0.4em;
        z-index: 8100;
        opacity: 0.65;
    }
    :global(.saveallimages):hover {
        opacity: 1;
    }
</style>
