import { Initialize as InitGlobalSettings, Key as GlobalKey } from './SettingsGlobal';
import { Tags } from './Tags';
import { PluginController } from './PluginController';
import { BookmarkPlugin } from './providers/BookmarkPlugin';
import { ItemflagManager } from './ItemflagManager';
import { CreateStorageController, type StorageController } from './StorageController';
import { InteractiveFileContentProvider } from './InteractiveFileContentProvider';
import { SettingsManager, type Check, type Numeric } from './SettingsManager';
import { FeatureFlags } from './FeatureFlags';
import { DownloadManager } from './DownloadManager';
import { CreateBloatGuard } from './platform/BloatGuard';
import { SetupFetchProvider } from './platform/FetchProvider';
import { CreateRemoteProcedureCallManager } from './platform/RemoteProcedureCallManager';
import { CreateRemoteProcedureCallContract } from './platform/RemoteProcedureCallContract';
import type { IFrontendInfo } from '../frontend/IFrontend';
import { Observable } from './Observable';

/**
 * localStorage key holding the timestamp (ms) of the last bookmark new-content
 * check, so the boot scan runs only once per configured period.
 */
export const CheckNewContentTimestampKey = 'check-new-content-last-run';

/**
 * True when the bookmark new-content check should run again: either it never
 * ran, or the configured period (in minutes) has elapsed since the last run.
 */
export function ShouldRefreshContentFlags(lastRun: number, now: number, periodMinutes: number): boolean {
    return !lastRun || now - lastRun >= periodMinutes * 60_000;
}

export class HakuNeko {

    readonly #storageController: StorageController;
    readonly #settingsManager: SettingsManager;
    readonly #featureFlags: FeatureFlags;
    readonly #pluginController: PluginController;
    readonly #bookmarkPlugin: BookmarkPlugin;
    readonly #itemflagManager: ItemflagManager;
    readonly #downloadManager: DownloadManager;
    readonly #pastedClipboardURL = new Observable<URL>(null);

    constructor() {
        this.#storageController = CreateStorageController();
        this.#settingsManager = new SettingsManager(this.#storageController);
        this.#featureFlags = new FeatureFlags(this.#settingsManager);
        this.#pluginController = new PluginController(this.#storageController, this.#settingsManager);
        this.#bookmarkPlugin = new BookmarkPlugin(this.#storageController, this.#pluginController, new InteractiveFileContentProvider());
        this.#itemflagManager = new ItemflagManager(this.#storageController);
        this.#downloadManager = new DownloadManager(this.#storageController);
        SetupFetchProvider(this.#featureFlags);
    }

    public async Initialze(frontends: IFrontendInfo[]): Promise<void> {
        await CreateBloatGuard().Initialize();
        await this.FeatureFlags.Initialize();
        await InitGlobalSettings(this.SettingsManager, frontends);
        CreateRemoteProcedureCallManager(this.#settingsManager);
        CreateRemoteProcedureCallContract();
        // Preload bookmark flags to show new content — at most once per configured
        // period (default 1 day). Fetching a bookmark's chapters opens a real
        // browser window for Cloudflare-protected sites (e.g. CrunchyScan), so
        // running it on every launch surfaced a challenge window at startup.
        const settings = this.SettingsManager.OpenScope();
        const checkNewContent = settings.Get<Check>(GlobalKey.CheckNewContent).Value;
        if (checkNewContent) {
            const periodMinutes = settings.Get<Numeric>(GlobalKey.CheckNewContentPeriod).Value;
            const lastRun = Number(window.localStorage.getItem(CheckNewContentTimestampKey) ?? 0);
            if (ShouldRefreshContentFlags(lastRun, Date.now(), periodMinutes)) {
                this.BookmarkPlugin.RefreshAllFlags();
                window.localStorage.setItem(CheckNewContentTimestampKey, `${Date.now()}`);
            }
        }
    }

    public get Tags() {
        return Tags;
    }

    public get PluginController(): PluginController {
        return this.#pluginController;
    }

    public get FeatureFlags(): FeatureFlags {
        return this.#featureFlags;
    }

    public get SettingsManager(): SettingsManager {
        return this.#settingsManager;
    }

    public get BookmarkPlugin(): BookmarkPlugin {
        return this.#bookmarkPlugin;
    }

    public get ItemflagManager(): ItemflagManager {
        return this.#itemflagManager;
    }

    public get DownloadManager(): DownloadManager {
        return this.#downloadManager;
    }

    public get PastedClipboardURL(): Observable<URL> {
        return this.#pastedClipboardURL;
    }
}