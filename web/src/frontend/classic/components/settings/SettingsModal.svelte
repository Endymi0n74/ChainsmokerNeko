<script lang="ts">
    import {
        Button,
        InlineNotification,
        Modal,
        Tabs,
        Tab,
        TabContent,
        TextInput,
    } from 'carbon-components-svelte';
    import SettingsViewer from './SettingsViewer.svelte';
    import ViewerSettings from '../viewer/Settings.svelte';
    import { frontendClassicSettings, frontendClassicSettingsViewer } from '../../stores/Settings.svelte';
    import { Store as UI } from '../../stores/Stores.svelte';
    import { Scope as Global_Scope } from '../../../../engine/SettingsGlobal';
    import { Tags } from '../../../../engine/Tags';
    import { Chapter } from '../../../../engine/providers/MangaPlugin';

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

    // Auto-download: new chapters (< 48h) from bookmarks, English only.
    let isAutoDownloading = $state(false);
    let autoDownloadStatus = $state('');

    async function downloadNewChapters() {
        if (isAutoDownloading) return;
        isAutoDownloading = true;
        autoDownloadStatus = 'Checking bookmarks…';
        const cutoff = Date.now() - 48 * 60 * 60 * 1000;
        const chapters: Chapter[] = [];
        try {
            const bookmarks = [...window.HakuNeko.BookmarkPlugin.Entries.Value];
            await Promise.all(bookmarks.map(async bookmark => {
                try {
                    await bookmark.Update();
                } catch { /* broken/missing website: skip */ return; }
                for (const entry of bookmark.Entries.Value) {
                    if (!(entry instanceof Chapter)) continue;
                    const isEnglish = entry.Tags.Value.some(tag => tag === Tags.Language.English);
                    const publishedAt = entry.PublishedAt;
                    if (isEnglish && publishedAt && publishedAt.getTime() >= cutoff) {
                        chapters.push(entry);
                    }
                }
            }));
            if (chapters.length > 0) {
                await window.HakuNeko.DownloadManager.Enqueue(...chapters);
                autoDownloadStatus = `${chapters.length} new English chapter${chapters.length > 1 ? 's' : ''} added to the download queue.`;
            } else {
                autoDownloadStatus = 'No new English chapters in the last 48 hours.';
            }
        } catch (error) {
            console.error('downloadNewChapters', error);
            autoDownloadStatus = 'An error occurred while checking your bookmarks.';
        } finally {
            isAutoDownloading = false;
        }
    }

    // Cloudflare clearance import: reuse the cf_clearance cookie from the real browser.
    let cfHost = $state('crunchyscan.org');
    let cfManualValue = $state('');
    let cfImporting = $state(false);
    let cfStatus = $state('');

    async function importCloudFlareClearance() {
        if (cfImporting) return;
        cfImporting = true;
        cfStatus = 'Reading browser cookies…';
        try {
            cfStatus = await UI.WindowController.ImportCloudFlareClearance(cfHost) ?? 'No result.';
        } catch (error) {
            cfStatus = 'Import failed: ' + String(error);
        } finally {
            cfImporting = false;
        }
    }

    async function injectCloudFlareClearance() {
        if (!cfManualValue.trim()) {
            cfStatus = 'Paste the cf_clearance value first.';
            return;
        }
        cfStatus = await UI.WindowController.SetCloudFlareClearance(cfHost, cfManualValue.trim()) ?? 'No result.';
    }

    let cfTesting = $state(false);
    let cfTestStatus = $state('');

    async function testCloudFlareClearance() {
        if (cfTesting) return;
        cfTesting = true;
        cfTestStatus = 'Testing…';
        try {
            cfTestStatus = await UI.WindowController.TestCloudFlareClearance(cfHost) ?? 'No result.';
        } catch (error) {
            cfTestStatus = 'Test failed: ' + String(error);
        } finally {
            cfTesting = false;
        }
    }
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
                <div class="autodl">
                    <h4>Auto-download new chapters</h4>
                    <p>
                        Downloads the new chapters released in the last 48 hours
                        from your bookmarks (English versions only).
                    </p>
                    <div class="autodl-actions">
                        <Button
                            kind="primary"
                            disabled={isAutoDownloading}
                            onclick={downloadNewChapters}
                        >
                            {isAutoDownloading ? 'Checking…' : 'Download new chapters (48h)'}
                        </Button>
                        {#if autoDownloadStatus}
                            <span class="autodl-status">{autoDownloadStatus}</span>
                        {/if}
                    </div>
                </div>
                <div class="autodl splash">
                    <h4>Splash screen</h4>
                    <SettingsViewer
                        settings={[
                            window.HakuNeko.FeatureFlags.SplashScreenMinimumDuration,
                        ]}
                    />
                </div>
                <div class="autodl">
                    <h4>Cloudflare bypass</h4>
                    <p>
                        If a site loops on “Un instant…”, reuse the cf_clearance cookie
                        from your real browser. Automatic import works on
                        <strong>Windows</strong>, <strong>macOS</strong> and
                        <strong>Linux</strong> (Chrome / Edge / Chromium) — close the
                        browser first so its cookie store is unlocked. On Windows,
                        Edge with <strong>App-Bound Encryption</strong> cannot be read
                        automatically. Otherwise paste the value from DevTools
                        (Application → Cookies → {cfHost} → cf_clearance).
                    </p>
                    <div class="autodl-actions">
                        <Button
                            kind="primary"
                            disabled={cfImporting}
                            onclick={importCloudFlareClearance}
                        >
                            {cfImporting ? 'Importing…' : 'Import cf_clearance from browser'}
                        </Button>
                        <Button
                            kind="secondary"
                            disabled={cfTesting}
                            onclick={testCloudFlareClearance}
                        >
                            {cfTesting ? 'Testing…' : 'Test now'}
                        </Button>
                    </div>
                    <div class="autodl-actions cf-manual">
                        <TextInput
                            labelText="Manual value"
                            placeholder="paste cf_clearance value"
                            bind:value={cfManualValue}
                        />
                        <Button kind="secondary" onclick={injectCloudFlareClearance}>
                            Inject
                        </Button>
                    </div>
                    {#if cfStatus}
                        <span class="autodl-status">{cfStatus}</span>
                    {/if}
                    {#if cfTestStatus}
                        <span class="autodl-status">{cfTestStatus}</span>
                    {/if}
                </div>
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
    .autodl {
        margin: 1rem 0;
        padding: 1rem;
        border: 1px solid var(--cds-border-subtle-00, #e0e0e0);
        border-radius: 0.5rem;
    }
    .autodl h4 {
        margin: 0 0 0.25rem;
    }
    .autodl p {
        margin: 0 0 0.75rem;
        font-size: 0.875rem;
        color: var(--cds-text-secondary, #525252);
    }
    .autodl-actions {
        display: flex;
        align-items: center;
        gap: 1rem;
    }
    .autodl-actions.cf-manual {
        margin-top: 0.75rem;
    }
    .autodl-actions.cf-manual :global(.cds--text-input__field-wrapper) {
        flex: 1;
        max-width: 32rem;
    }
    .autodl-status {
        display: block;
        margin-top: 0.75rem;
        font-size: 0.875rem;
        color: var(--cds-text-secondary, #525252);
    }
</style>
