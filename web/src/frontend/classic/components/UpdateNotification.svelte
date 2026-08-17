<script lang="ts">
    import { ToastNotification } from 'carbon-components-svelte';
    import { onMount } from 'svelte';
    import type { IUpdateInfo } from '../../../engine/platform/AppWindow';
    import { Store as UI } from '../stores/Stores.svelte';

    let update: IUpdateInfo = $state(null);
    let open = $state(false);

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
                <a href={update.url} target="_blank" rel="noopener">Download v{update.version} on GitHub</a>
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
</style>
