<script lang="ts">
    import { ToastNotification } from 'carbon-components-svelte';
    import { onMount } from 'svelte';
    import type { IUpdateInfo } from '../../../engine/platform/AppWindow';
    import { Store as UI } from '../stores/Stores.svelte';

    let update: IUpdateInfo = $state(null);
    let open = $state(false);
    let installing = $state(false);
    let status = $state('');

    onMount(() => {
        UI.WindowController?.CheckForUpdates()
            .then(info => {
                if (info) {
                    update = info;
                    open = true;
                }
            })
            .catch(() => { /* Update check must never surface an error */ });
    });

    function dismiss() {
        open = false;
        update = null;
    }

    async function install() {
        if (!update) return;
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

{#if update}
    <div class="update-notification">
        <ToastNotification
            bind:open
            kind="info"
            lowContrast
            timeout={0}
            title={`Update available — v${update.version}`}
            closeButtonDescription="Dismiss update notification"
            on:close={dismiss}
        >
            <svelte:fragment slot="subtitleChildren">
                {#if installing}
                    <span class="update-status">{status}</span>
                {:else}
                    <div class="update-actions">
                        <button class="update-install-btn" onclick={install}>
                            Install v{update.version}
                        </button>
                        <a href={update.url} target="_blank" rel="noopener">
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
        max-width: 24rem;
        -webkit-app-region: no-drag;
    }
    .update-notification :global(a) {
        color: var(--cds-link-01, #0f62fe);
    }
    .update-actions {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin-top: 0.25rem;
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
