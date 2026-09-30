<script lang="ts">
    import { Button, Tile } from 'carbon-components-svelte';
    import Renew from 'carbon-icons-svelte/lib/Renew.svelte';
    import changelog from '../../../../../../CHANGELOG.en.md?raw';
    import { RenderReleaseNotes } from '../../lib/changelog';
    import { Store as UI } from '../../stores/Stores.svelte';

    /** The published releases of the fork, for the whole history. */
    const releasesURL = 'https://github.com/Endymi0n74/ChainsmokerNeko/releases';

    /** The label of the manual check doubles as its own status, like the entry of the "About" menu. */
    let checkState = $state<'idle' | 'checking' | 'uptodate' | 'available'>('idle');
    let version = $state('');

    $effect(() => {
        UI.WindowController?.GetVersion().then(value => version = value).catch(() => version = '');
    });

    /**
     * The release notes of the running version: they are extracted from the changelog which is
     * bundled into the application, so this panel needs neither the network nor a documentation
     * server (the panel it replaces was fetching upstream placeholder pages from hakuneko.download).
     */
    const notes = $derived(RenderReleaseNotes(changelog, version));

    const status = $derived.by(() => {
        switch (checkState) {
            case 'checking': return 'Checking for updates...';
            case 'available': return UI.update ? `Update available — v${UI.update.version}` : '';
            case 'uptodate': return `Up to date${version ? ` — v${version}` : ''}`;
            default: return '';
        }
    });

    async function CheckForUpdates(): Promise<void> {
        if (checkState === 'checking' || !UI.WindowController) {
            return;
        }
        checkState = 'checking';
        // The store deduplicates concurrent queries and never rejects: an unreachable
        // update service must not break the panel, it simply reports "Up to date".
        const update = await UI.CheckForUpdate();
        checkState = update ? 'available' : 'uptodate';
    }
</script>

<Tile id="whatsnew" class="border">
    <div class="head">
        <h4>What's new</h4>
        <div class="controls">
            {#if status}
                <span class="status">{status}</span>
            {/if}
            <Button
                kind="ghost"
                size="small"
                icon={Renew}
                disabled={checkState === 'checking'}
                onclick={CheckForUpdates}
            >
                Check for updates
            </Button>
        </div>
    </div>
    {#if notes}
        <div class="notes">{@html notes}</div>
    {:else if version}
        <p class="empty">No release notes are available for version {version}.</p>
    {:else}
        <p class="empty">Loading release notes...</p>
    {/if}
    <p class="more">
        <a href={releasesURL} target="_blank" rel="noopener">All releases on GitHub</a>
    </p>
</Tile>

<style>
    .head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75em;
        flex-wrap: wrap;
    }
    .head h4 {
        margin: 0;
    }
    .controls {
        display: flex;
        align-items: center;
        gap: 0.5em;
        flex-wrap: wrap;
    }
    .status {
        font-size: 0.85em;
        opacity: 0.8;
        white-space: nowrap;
    }
    /* The entries of the changelog are long: the panel scrolls instead of pushing the
       whole home page down, and stays readable at a glance. */
    .notes {
        max-height: 16em;
        overflow-y: auto;
        margin-top: 0.75em;
        font-size: 0.9em;
        line-height: 1.5;
    }
    .notes :global(h4) {
        font-size: 1em;
        margin: 0.5em 0 0.25em;
    }
    .notes :global(h5) {
        font-size: 0.9em;
        margin: 0.75em 0 0.25em;
        opacity: 0.75;
        text-transform: uppercase;
        letter-spacing: 0.03em;
    }
    .notes :global(p) {
        margin: 0.25em 0;
    }
    .notes :global(ul) {
        margin: 0.25em 0;
        padding-left: 1.25em;
        list-style: disc;
    }
    .notes :global(li) {
        margin: 0.2em 0;
    }
    .notes :global(code) {
        font-family: monospace;
        font-size: 0.9em;
        background: rgba(128, 128, 128, 0.2);
        padding: 0 0.25em;
        border-radius: 0.25em;
    }
    .notes :global(a),
    .more :global(a) {
        color: var(--cds-link-01, #0f62fe);
    }
    .empty {
        margin: 0.75em 0 0;
        font-size: 0.9em;
        opacity: 0.7;
    }
    .more {
        margin: 0.75em 0 0;
        font-size: 0.85em;
    }
</style>
