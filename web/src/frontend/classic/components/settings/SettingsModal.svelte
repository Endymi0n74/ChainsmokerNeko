<script lang="ts">
    import {
        InlineNotification,
        Modal,
        Tabs,
        Tab,
        TabContent,
    } from 'carbon-components-svelte';
    import SettingsViewer from './SettingsViewer.svelte';
    import ViewerSettings from '../viewer/Settings.svelte';
    import { frontendClassicSettings, frontendClassicSettingsViewer } from '../../stores/Settings.svelte';
    import { Store as UI } from '../../stores/Stores.svelte';
    import { Scope as Global_Scope } from '../../../../engine/SettingsGlobal';

    interface Props {
        isSettingsModalOpen: boolean;
        selectedTab: number;
    };
    let { isSettingsModalOpen = $bindable(false), selectedTab = 0}: Props  = $props();

    let appVersion = $state('');
    $effect(() => {
        if (isSettingsModalOpen) {
            UI.WindowController?.GetVersion().then(version => appVersion = version).catch(() => appVersion = '');
        }
    });
</script>

<Modal
    id="settingModal"
    size="lg"
    hasScrollingContent
    bind:open={isSettingsModalOpen}
    passiveModal
    modalHeading="Settings"
    on:click:button--secondary={() => (isSettingsModalOpen = false)}
    on:open
    on:close
    hasForm
>
    <Tabs type="container" bind:selected={selectedTab}>
        <Tab label="General" />
        <Tab label="Interface" />
        <Tab label="Viewer" />
        <Tab label="Trackers" />
        <!-- TODO: selectedtab check: temporary cheat until carbon is svelte5 (snippets instead of slots) -->
        <svelte:fragment slot="content">
            <TabContent
                class="settingtab {selectedTab === 0 ? 'activetab' : 'hidden'}"
            >
                <SettingsViewer
                    settings={[
                        ...window.HakuNeko.SettingsManager.OpenScope(Global_Scope),
                    ]}
                />
            </TabContent>
            <TabContent
                class="settingtab {selectedTab === 1 ? 'activetab' : 'hidden'}"
            >
                <SettingsViewer
                    settings={[
                        ...frontendClassicSettings,
                    ]}
                />
            </TabContent>
            <TabContent
                class="settingtab {selectedTab === 2 ? 'activetab' : 'hidden'}"
            >
                <SettingsViewer
                    settings={[
                        ...frontendClassicSettingsViewer,
                    ]}
                />
            </TabContent>
            <TabContent
                class="settingtab {selectedTab === 3 ? 'activetab' : 'hidden'}"
            >
                <InlineNotification
                    kind="warning"
                    title="Not implemented"
                    subtitle="Trackers are currently not used (yet)"
                />
                {#each [...window.HakuNeko.PluginController.InfoTrackers].filter((tracker) => [...tracker.Settings].length > 0) as tracker}
                    <h4>{tracker.Title}</h4>
                    <SettingsViewer settings={[...tracker.Settings]} />
                {/each}
            </TabContent>
        </svelte:fragment>
    </Tabs>
    {#if appVersion}
        <p class="app-version">HakuNeko v{appVersion}</p>
    {/if}
</Modal>

<style>
    .app-version {
        margin: 0.5rem 1rem 0;
        text-align: right;
        font-size: 0.75rem;
        color: var(--cds-text-secondary, #525252);
    }
    :global(#settingModal .settingtab) {
        height: 70vh;
    }
    :global(#settingModal .settingtab.hidden) {
        display: none;
    }
</style>
