import type { MediaContainer, MediaChild, MediaItem } from '../../../engine/providers/MediaPlugin';
import type { Bookmark } from '../../../engine/providers/Bookmark';
import type { IAppWindow, IUpdateInfo } from '../../../engine/platform/AppWindow';
import { Settings } from './Settings.svelte';

/**
 * The single in-flight update query: the automatic check performed at startup and the manual
 * "Check for updates" entry of the sidenav must not duplicate the request, and the second
 * caller has to await the result of the first one instead of observing a stale `null`.
 */
let pendingUpdateCheck: Promise<IUpdateInfo | null> | null = null;

class UIClassicStore {
    WindowController:IAppWindow = $state();
    /** Release newer than the running application, reported by the last update check. */
    update:IUpdateInfo = $state(null);
    /** Determines whether the update notification toast is currently displayed. */
    updateOpen:boolean = $state(false);
    selectedPlugin: MediaContainer<MediaChild> = $state(HakuNeko.BookmarkPlugin);
    selectedMedia: MediaContainer<MediaChild> = $state(null);
    selectedItem: MediaContainer<MediaItem> = $state();
    selectedItemPrevious: MediaContainer<MediaItem> = $state();
    selectedItemNext: MediaContainer<MediaItem> = $state();
    contentscreen: string = $state('/');
    suggestions:Promise<Bookmark[]> = $derived( refreshSuggestions());

    /**
     * Query the update service for a release newer than the running application and publish
     * the outcome to the store, so the notification toast and the manual sidenav entry always
     * agree on the result. Never rejects: an unreachable update service must not break the UI.
     */
    public CheckForUpdate(): Promise<IUpdateInfo | null> {
        if (!pendingUpdateCheck) {
            pendingUpdateCheck = (async () => {
                try {
                    const info = await this.WindowController?.CheckForUpdates() ?? null;
                    if (info) {
                        this.update = info;
                        this.updateOpen = true;
                    }
                    return info;
                } catch {
                    return null;
                } finally {
                    pendingUpdateCheck = null;
                }
            })();
        }
        return pendingUpdateCheck;
    }
}
export let Store:UIClassicStore = new UIClassicStore();

async function refreshSuggestions() : Promise<Bookmark[]> {
    return Settings.checkNewContent.Value ? await HakuNeko.BookmarkPlugin.GetEntriesWithUnflaggedContent() : [];
}
