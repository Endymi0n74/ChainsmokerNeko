<script lang="ts">
    import { ToastNotification } from 'carbon-components-svelte';
    import { Store as UI } from '../stores/Stores.svelte';

    let installing = $state(false);
    let status = $state('');
    let checked = false;

    // The controller is injected by the frontend module: watch for it instead of reading it
    // once in onMount, where it may still be undefined — the optional chain would then
    // short-circuit and the update check would never run, silently and without any error.
    // The store dedupes the query, so the manual "Check for updates" entry of the sidenav
    // can trigger it again at any time without duplicating a running request.
    $effect(() => {
        if (!UI.WindowController || checked) {
            return;
        }
        checked = true;
        void UI.CheckForUpdate();
    });

    function dismiss() {
        UI.updateOpen = false;
        UI.update = null;
    }

    async function install() {
        const update = UI.update;
        if (!update) {
            return;
        }
        installing = true;
        status = 'Downloading...';
        try {
            const result = await UI.WindowController?.DownloadAndInstall(update.version);
            status = result || 'Done';
        } catch (e) {
            status = 'Error: ' + String(e);
            installing = false;
        }
    }
</script>

{#if UI.update}
    <div class="update-notification">
        <ToastNotification
            bind:open={UI.updateOpen}
            kind="info"
            lowContrast
            timeout={0}
            title={`Update available — v${UI.update.version}`}
            closeButtonDescription="Dismiss update notification"
            on:close={dismiss}
        >
            <svelte:fragment slot="subtitleChildren">
                {#if installing}
                    <span class="update-status">{status}</span>
                {:else}
                    <div class="update-actions">
                        <button class="update-install-btn" onclick={install}>
                            Install v{UI.update.version}
                        </button>
                        <a href={UI.update.url} target="_blank" rel="noopener">
                            Download on GitHub
                        </a>
                    </div>
                {/if}
            </svelte:fragment>
        </ToastNotification>
    </div>
{/if}

<style>
    .update-notification {
        position: fixed;
        right: 1rem;
        bottom: 1rem;
        z-index: 1000;
        /* max-content gives the box the room its two actions need (the button refuses to
           shrink, so the link used to be squeezed until it broke mid-word), while the cap
           keeps a long version from ever overflowing a narrow window. */
        width: max-content;
        max-width: 24rem;
        -webkit-app-region: no-drag;
    }
    .update-notification :global(a) {
        color: var(--cds-link-01, #0f62fe);
    }
    .update-actions {
        display: flex;
        /* never squeeze an action below its text width: it moves to its own line first */
        flex-wrap: wrap;
        align-items: center;
        gap: 0.75rem;
        margin-top: 0.25rem;
    }
    .update-notification :global(a) {
        white-space: nowrap;
    }
    .update-install-btn {
        background: var(--cds-link-01, #0f62fe);
        color: #fff;
        border: none;
        border-radius: 4px;
        padding: 0.25rem 0.75rem;
        font-size: 0.8rem;
        cursor: pointer;
        white-space: nowrap;
    }
    .update-install-btn:hover {
        background: var(--cds-link-02, #0043ce);
    }
    .update-status {
        font-size: 0.8rem;
        opacity: 0.8;
    }
</style>
